import { EventEmitter } from './serial.ts'
import type {
  ModbusReadConfig,
  ModbusResponse,
  ModbusWriteConfig,
} from './types.ts'

// CRC16 Modbus calculation function
function calculateCRC16(data: number[]): number {
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
      this.pendingRequest.functionCode !== functionCode
    ) {
      return
    }

    // Error response check
    if (functionCode & 0x80) {
      const errorCode = this.buffer[2]
      this.handleError(errorCode)
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
    // Simplified ASCII implementation
    // Real implementation would detect ':' start and CR+LF end
    const frame = this.buffer
    if (frame.length >= 7) {
      // 最小フレーム長
      this.processValidResponse(frame.length)
    }
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
    }

    return new Uint8Array(request)
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
    } else {
      throw new Error(`Unsupported function code: ${config.functionCode}`)
    }

    if (this.protocol === 'rtu') {
      const crcValue = calculateCRC16(request)
      request.push(crcValue & 0xff, (crcValue >> 8) & 0xff)
    }

    return new Uint8Array(request)
  }
}
