import { EventEmitter } from './serial.ts'
import type {
  ModbusReadConfig,
  ModbusResponse,
  ModbusWriteConfig,
} from './types.ts'

// Re-export functions and constants for backwards compatibility
export { calculateCRC16 } from './crc.ts'
export {
  findFrameResyncPosition,
  isPlausibleFrameStart,
  parseBitResponse,
  parseRegisterResponse,
} from './frameParser.ts'
export { FUNCTION_CODE_LABELS } from './functionCodes.ts'
export { calculateLRC } from './lrc.ts'

// Import the new modular functions
import { calculateCRC16 } from './crc.ts'
import {
  ModbusBusyError,
  ModbusExceptionError,
  ModbusTimeoutError,
} from './errors.ts'
import { buildReadRequest, buildWriteRequest } from './frameBuilder.ts'
import {
  findFrameResyncPosition,
  parseBitResponse,
  parseRegisterResponse,
} from './frameParser.ts'
import { FUNCTION_CODE_LABELS } from './functionCodes.ts'
import { calculateLRC } from './lrc.ts'

// Event types for ModbusClient
type ModbusClientEvents = {
  response: [ModbusResponse]
  error: [Error]
  request: [Uint8Array]
}

// Modbus client class
export class ModbusClient extends EventEmitter<ModbusClientEvents> {
  private protocol: 'rtu' | 'ascii' = 'rtu'
  private pendingRequest: {
    slaveId: number
    functionCode: number
    resolve: (response: ModbusResponse) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  } | null = null
  private monitoringInterval: ReturnType<typeof setInterval> | null = null
  private buffer: number[] = []
  // ASCII state tracking
  private asciiBuffer: string = ''
  private asciiFrameStarted = false

  setProtocol(protocol: 'rtu' | 'ascii') {
    this.protocol = protocol
  }

  async read(config: ModbusReadConfig): Promise<ModbusResponse> {
    return new Promise((resolve, reject) => {
      if (this.pendingRequest) {
        reject(new ModbusBusyError())
        return
      }

      const request = this.buildReadRequest(config)
      this.pendingRequest = {
        functionCode: config.functionCode,
        reject,
        resolve,
        slaveId: config.slaveId,
        timeout: setTimeout(() => {
          this.pendingRequest = null
          reject(new ModbusTimeoutError())
        }, 3000),
      }

      this.emit('request', request)

      // 既にバッファ内に対象スレーブのレスポンスが残っている（連結フレーム等）場合の即時再解析
      if (
        this.buffer.length > 0 ||
        (this.protocol === 'ascii' && this.asciiBuffer.length > 0)
      ) {
        if (this.protocol === 'rtu') {
          this.handleRTUResponse()
        } else {
          this.handleASCIIResponse()
        }
      }
    })
  }

  async write(config: ModbusWriteConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pendingRequest) {
        reject(new ModbusBusyError())
        return
      }

      const request = this.buildWriteRequest(config)
      this.pendingRequest = {
        functionCode: config.functionCode,
        reject,
        resolve: () => resolve(),
        slaveId: config.slaveId,
        timeout: setTimeout(() => {
          this.pendingRequest = null
          reject(new ModbusTimeoutError())
        }, 3000),
      }

      this.emit('request', request)
    })
  }

  startMonitoring(config: ModbusReadConfig, interval = 1000) {
    this.stopMonitoring()

    this.monitoringInterval = setInterval(async () => {
      try {
        const response = await this.read(config)
        this.emit('response', response)
      } catch (error) {
        this.emit('error', error as Error)
      }
    }, interval)
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
  }

  handleResponse(data: Uint8Array) {
    // Append data to buffer
    this.buffer.push(...Array.from(data))

    if (this.protocol === 'rtu') {
      this.handleRTUResponse()
    } else {
      this.handleASCIIResponse()
    }
  }

  private handleRTUResponse() {
    while (this.buffer.length >= 5) {
      const slaveId = this.buffer[0]
      const functionCode = this.buffer[1]

      // Check if this frame matches our pending request
      const isMatchingFrame =
        this.pendingRequest &&
        this.pendingRequest.slaveId === slaveId &&
        // 許可: 通常関数コード または 例外フレーム(function | 0x80)
        (this.pendingRequest.functionCode === functionCode ||
          (functionCode & 0x80 &&
            (functionCode & 0x7f) === this.pendingRequest.functionCode))

      if (!isMatchingFrame) {
        // If we have a pending request but frame doesn't match, try to advance buffer
        if (this.pendingRequest) {
          const resyncPosition = findFrameResyncPosition(this.buffer)
          if (resyncPosition !== -1) {
            this.buffer = this.buffer.slice(resyncPosition)
            continue // Try again with advanced buffer
          } else {
            // No valid frame found, just advance by 1 byte and try again
            this.buffer = this.buffer.slice(1)
            continue
          }
        }
        return
      }

      // Error response check (exception frame length = 5 bytes: slave + fc + ex + CRC2)
      if (functionCode & 0x80) {
        if (this.buffer.length < 5) return
        const messageWithoutCRC = this.buffer.slice(0, 3)
        const receivedCRC = (this.buffer[4] << 8) | this.buffer[3]
        const calculatedCRC = calculateCRC16(messageWithoutCRC)
        if (receivedCRC !== calculatedCRC) {
          this.handleError(new Error('CRC error'))
          return
        }
        const errorCode = this.buffer[2]
        this.handleError(errorCode)
        // 例外フレーム消費
        this.buffer = this.buffer.slice(5)
        return
      }

      let responseLength: number
      if (
        functionCode === 1 ||
        functionCode === 2 ||
        functionCode === 3 ||
        functionCode === 4
      ) {
        // Read function
        const dataLength = this.buffer[2]
        responseLength = 3 + dataLength + 2 // slaveID + function + byte count + data + CRC
      } else {
        // Write function
        responseLength = 8 // fixed length
      }

      if (this.buffer.length < responseLength) return

      // CRC check
      const messageWithoutCRC = this.buffer.slice(0, responseLength - 2)
      const receivedCRC =
        (this.buffer[responseLength - 1] << 8) | this.buffer[responseLength - 2]
      const calculatedCRC = calculateCRC16(messageWithoutCRC)

      if (receivedCRC !== calculatedCRC) {
        this.handleError(new Error('CRC error'))
        return
      }

      // Process response
      this.processValidResponse(responseLength)
      return
    }
  }

  private handleASCIIResponse() {
    // Convert buffer to string to look for ASCII frame markers
    const newData = String.fromCharCode(...this.buffer)
    this.asciiBuffer += newData
    this.buffer = [] // Clear the buffer as we've moved data to asciiBuffer

    // Process only one complete frame at a time (like RTU mode)
    // Look for start of frame ':'
    if (!this.asciiFrameStarted) {
      const startIndex = this.asciiBuffer.indexOf(':')
      if (startIndex === -1) {
        // No start found, keep waiting
        return
      }
      // Remove everything before ':'
      this.asciiBuffer = this.asciiBuffer.substring(startIndex)
      this.asciiFrameStarted = true
    }

    // Look for end of frame \r\n
    const endIndex = this.asciiBuffer.indexOf('\r\n')
    if (endIndex === -1) {
      // Frame not complete yet
      return
    }

    // Extract complete frame (including : but excluding \r\n)
    const frameString = this.asciiBuffer.substring(0, endIndex)
    this.asciiBuffer = this.asciiBuffer.substring(endIndex + 2)
    this.asciiFrameStarted = false

    // Parse the frame
    this.parseASCIIFrame(frameString)
  }

  private parseASCIIFrame(frameString: string) {
    // Frame should start with ':' and contain hex pairs
    if (frameString.length < 3 || frameString[0] !== ':') {
      this.handleError(new Error('Invalid ASCII frame format'))
      return
    }

    // Remove the ':' and parse hex pairs
    const hexString = frameString.substring(1)
    if (hexString.length % 2 !== 0) {
      this.handleError(
        new Error('ASCII frame contains odd number of hex characters')
      )
      return
    }

    // Convert hex pairs to bytes
    const frameBytes: number[] = []
    for (let i = 0; i < hexString.length; i += 2) {
      const hexPair = hexString.substring(i, i + 2)

      // Validate that both characters are valid hex digits
      if (!/^[0-9A-Fa-f]{2}$/.test(hexPair)) {
        this.handleError(
          new Error(`Invalid hex pair in ASCII frame: ${hexPair}`)
        )
        return
      }

      const byte = parseInt(hexPair, 16)
      frameBytes.push(byte)
    }

    // Need at least slave + function + LRC = 3 bytes
    if (frameBytes.length < 3) {
      this.handleError(new Error('ASCII frame too short'))
      return
    }

    // Extract LRC (last byte) and message (all but last byte)
    const receivedLRC = frameBytes[frameBytes.length - 1]
    const messageBytes = frameBytes.slice(0, -1)
    const calculatedLRC = calculateLRC(messageBytes)

    if (receivedLRC !== calculatedLRC) {
      this.handleError(new Error('LRC error'))
      return
    }

    // Validate against pending request
    if (!this.pendingRequest) {
      return
    }

    const slaveId = messageBytes[0]
    const functionCode = messageBytes[1]

    if (
      this.pendingRequest.slaveId !== slaveId ||
      !(
        this.pendingRequest.functionCode === functionCode ||
        (functionCode & 0x80 &&
          (functionCode & 0x7f) === this.pendingRequest.functionCode)
      )
    ) {
      return
    }

    // Handle exception frame (function | 0x80)
    if (functionCode & 0x80) {
      if (messageBytes.length < 3) {
        this.handleError(new Error('Invalid exception frame length'))
        return
      }
      const errorCode = messageBytes[2]
      this.handleError(errorCode)
      return
    }

    // Process valid response - reuse existing RTU logic by simulating RTU frame
    // Convert ASCII frame back to RTU format for existing processing logic
    this.processValidASCIIResponse(messageBytes)
  }

  private processValidASCIIResponse(messageBytes: number[]) {
    if (!this.pendingRequest) return

    const slaveId = messageBytes[0]
    const functionCode = messageBytes[1]

    let data: number[] = []
    if (functionCode === 3 || functionCode === 4) {
      // Register read response (FC03/FC04)
      const dataLength = messageBytes[2]
      data = parseRegisterResponse(messageBytes, dataLength)
    } else if (functionCode === 1 || functionCode === 2) {
      // Coil/input status read response (FC01/FC02)
      const dataLength = messageBytes[2]
      data = parseBitResponse(messageBytes, dataLength)
    }

    const modbusResponse: ModbusResponse = {
      data,
      functionCode,
      functionCodeLabel:
        FUNCTION_CODE_LABELS[functionCode] || `Unknown (${functionCode})`,
      slaveId,
      timestamp: new Date(),
    }

    clearTimeout(this.pendingRequest.timeout)
    this.pendingRequest.resolve(modbusResponse)
    this.pendingRequest = null
  }

  private processValidResponse(responseLength: number) {
    if (!this.pendingRequest) return

    const response = this.buffer.slice(0, responseLength)
    const slaveId = response[0]
    const functionCode = response[1]

    let data: number[] = []
    if (functionCode === 3 || functionCode === 4) {
      // Register read response (FC03/FC04)
      const dataLength = response[2]
      data = parseRegisterResponse(response, dataLength)
    } else if (functionCode === 1 || functionCode === 2) {
      // Coil/input status read response (FC01/FC02)
      const dataLength = response[2]
      data = parseBitResponse(response, dataLength)
    }

    const modbusResponse: ModbusResponse = {
      data,
      functionCode,
      functionCodeLabel:
        FUNCTION_CODE_LABELS[functionCode] || `Unknown (${functionCode})`,
      slaveId,
      timestamp: new Date(),
    }

    clearTimeout(this.pendingRequest.timeout)
    this.pendingRequest.resolve(modbusResponse)
    this.pendingRequest = null

    // Trim processed bytes from buffer
    this.buffer = this.buffer.slice(responseLength)
  }

  private handleError(error: number | Error, attemptResync = true) {
    if (!this.pendingRequest) return

    clearTimeout(this.pendingRequest.timeout)

    if (typeof error === 'number') {
      // Use the new ModbusExceptionError for consistency
      this.pendingRequest.reject(new ModbusExceptionError(error))
    } else {
      this.pendingRequest.reject(error)
    }

    this.pendingRequest = null

    // Attempt buffer resynchronization for RTU protocol
    if (attemptResync && this.protocol === 'rtu' && this.buffer.length > 0) {
      const resyncPosition = findFrameResyncPosition(this.buffer)
      if (resyncPosition !== -1) {
        // Found a potential frame start, advance buffer to that position
        this.buffer = this.buffer.slice(resyncPosition)
      } else {
        // No candidate found, clear buffer completely
        this.buffer = []
      }
    } else {
      // For ASCII or when resync disabled, clear buffer completely
      this.buffer = []
    }
  }

  private buildReadRequest(config: ModbusReadConfig): Uint8Array {
    return buildReadRequest(config, this.protocol)
  }

  private buildWriteRequest(config: ModbusWriteConfig): Uint8Array {
    return buildWriteRequest(config, this.protocol)
  }
}
