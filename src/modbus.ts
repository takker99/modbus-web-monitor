import { EventEmitter } from './serial.ts'
import type {
  ModbusReadConfig,
  ModbusResponse,
  ModbusWriteConfig,
} from './types.ts'

// CRC16 Modbus calculation function (exported for tests)
export function calculateCRC16(data: number[]): number {
  let crc = 0xffff
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001
      } else {
        crc = crc >> 1
      }
    }
  }
  return crc
}

// LRC (Longitudinal Redundancy Check) calculation for Modbus ASCII (exported for tests)
export function calculateLRC(data: number[]): number {
  let lrc = 0
  for (const byte of data) {
    lrc += byte
  }
  return (256 - (lrc % 256)) % 256
}

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
        reject(new Error('Another request is in progress'))
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
          reject(new Error('Request timed out'))
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
        reject(new Error('Another request is in progress'))
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
          reject(new Error('Request timed out'))
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
    // Minimum RTU response length is 5 bytes (slaveID + function + data length + CRC)
    if (this.buffer.length < 5) return

    const slaveId = this.buffer[0]
    const functionCode = this.buffer[1]

    if (
      !this.pendingRequest ||
      this.pendingRequest.slaveId !== slaveId ||
      // 許可: 通常関数コード または 例外フレーム(function | 0x80)
      !(
        this.pendingRequest.functionCode === functionCode ||
        (functionCode & 0x80 &&
          (functionCode & 0x7f) === this.pendingRequest.functionCode)
      )
    ) {
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
      const byte = parseInt(hexPair, 16)
      if (Number.isNaN(byte)) {
        this.handleError(
          new Error(`Invalid hex pair in ASCII frame: ${hexPair}`)
        )
        return
      }
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

    const data: number[] = []
    if (functionCode === 3 || functionCode === 4) {
      // Register read response
      const dataLength = messageBytes[2]
      for (let i = 0; i < dataLength; i += 2) {
        const value = (messageBytes[3 + i] << 8) | messageBytes[3 + i + 1]
        data.push(value)
      }
    } else if (functionCode === 1 || functionCode === 2) {
      // Coil/input status read response
      const dataLength = messageBytes[2]
      for (let i = 0; i < dataLength; i++) {
        const byte = messageBytes[3 + i]
        for (let bit = 0; bit < 8; bit++) {
          data.push((byte >> bit) & 1)
        }
      }
    }

    const modbusResponse: ModbusResponse = {
      data,
      functionCode,
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

    const data: number[] = []
    if (functionCode === 3 || functionCode === 4) {
      // レジスタ読み取り
      const dataLength = response[2]
      for (let i = 0; i < dataLength; i += 2) {
        const value = (response[3 + i] << 8) | response[3 + i + 1]
        data.push(value)
      }
    } else if (functionCode === 1 || functionCode === 2) {
      // コイル/入力ステータス読み取り
      const dataLength = response[2]
      for (let i = 0; i < dataLength; i++) {
        const byte = response[3 + i]
        for (let bit = 0; bit < 8; bit++) {
          data.push((byte >> bit) & 1)
        }
      }
    }

    const modbusResponse: ModbusResponse = {
      data,
      functionCode,
      slaveId,
      timestamp: new Date(),
    }

    clearTimeout(this.pendingRequest.timeout)
    this.pendingRequest.resolve(modbusResponse)
    this.pendingRequest = null

    // Trim processed bytes from buffer
    this.buffer = this.buffer.slice(responseLength)
  }

  private handleError(error: number | Error) {
    if (!this.pendingRequest) return

    clearTimeout(this.pendingRequest.timeout)

    if (typeof error === 'number') {
      const errorMessages: { [key: number]: string } = {
        1: 'Illegal function',
        2: 'Illegal data address (address does not exist)',
        3: 'Illegal data value',
        4: 'Slave device failure',
        5: 'Acknowledge',
        6: 'Slave device busy',
        8: 'Memory parity error',
        10: 'Gateway path unavailable',
        11: 'Gateway target device failed to respond',
      }
      const errorMessage = errorMessages[error] || `Modbus error ${error}`
      this.pendingRequest.reject(new Error(`${errorMessage} (code: ${error})`))
    } else {
      this.pendingRequest.reject(error)
    }

    this.pendingRequest = null
    this.buffer = []
  }

  private buildReadRequest(config: ModbusReadConfig): Uint8Array {
    const request = [
      config.slaveId,
      config.functionCode,
      (config.startAddress >> 8) & 0xff,
      config.startAddress & 0xff,
      (config.quantity >> 8) & 0xff,
      config.quantity & 0xff,
    ]

    if (this.protocol === 'rtu') {
      const crcValue = calculateCRC16(request)
      request.push(crcValue & 0xff, (crcValue >> 8) & 0xff)
      return new Uint8Array(request)
    } else {
      // ASCII mode: format as :AABBCC...DDLR\r\n
      const lrcValue = calculateLRC(request)
      request.push(lrcValue)

      // Convert to ASCII hex format
      const hexString = request
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('')

      // Create ASCII frame: : + hex data + \r\n
      const asciiFrame = `:${hexString}\r\n`
      return new Uint8Array(Array.from(asciiFrame).map((c) => c.charCodeAt(0)))
    }
  }

  private buildWriteRequest(config: ModbusWriteConfig): Uint8Array {
    let request: number[]

    if (config.functionCode === 5) {
      // Write single coil
      const value = Array.isArray(config.value) ? config.value[0] : config.value
      request = [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        value ? 0xff : 0x00,
        0x00,
      ]
    } else if (config.functionCode === 6) {
      // Write single register
      const value = Array.isArray(config.value) ? config.value[0] : config.value
      request = [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        (value >> 8) & 0xff,
        value & 0xff,
      ]
    } else if (config.functionCode === 15) {
      // Write multiple coils (FC15)
      if (!Array.isArray(config.value)) {
        throw new Error('FC15 requires value to be an array of bits (0/1)')
      }
      const quantity = config.value.length
      const byteCount = Math.ceil(quantity / 8)
      const coilBytes: number[] = new Array(byteCount).fill(0)
      config.value.forEach((bit, i) => {
        if (bit) {
          coilBytes[Math.floor(i / 8)] |= 1 << (i % 8)
        }
      })
      request = [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        (quantity >> 8) & 0xff,
        quantity & 0xff,
        byteCount,
        ...coilBytes,
      ]
    } else if (config.functionCode === 16) {
      // Write multiple registers (FC16)
      if (!Array.isArray(config.value)) {
        throw new Error('FC16 requires value to be an array of register values')
      }
      const quantity = config.value.length
      const byteCount = quantity * 2
      const registers: number[] = []
      for (const v of config.value) {
        registers.push((v >> 8) & 0xff, v & 0xff)
      }
      request = [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        (quantity >> 8) & 0xff,
        quantity & 0xff,
        byteCount,
        ...registers,
      ]
    } else {
      throw new Error(`Unsupported function code: ${config.functionCode}`)
    }

    if (this.protocol === 'rtu') {
      const crcValue = calculateCRC16(request)
      request.push(crcValue & 0xff, (crcValue >> 8) & 0xff)
      return new Uint8Array(request)
    } else {
      // ASCII mode: format as :AABBCC...DDLR\r\n
      const lrcValue = calculateLRC(request)
      request.push(lrcValue)

      // Convert to ASCII hex format
      const hexString = request
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('')

      // Create ASCII frame: : + hex data + \r\n
      const asciiFrame = `:${hexString}\r\n`
      return new Uint8Array(Array.from(asciiFrame).map((c) => c.charCodeAt(0)))
    }
  }
}
