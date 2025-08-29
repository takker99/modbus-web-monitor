// Serial communication configuration types
export interface SerialConfig {
  baudRate: number
  dataBits: 7 | 8
  parity: 'none' | 'even' | 'odd'
  stopBits: 1 | 2
}

// Modbus function code type aliases
export type ReadFunctionCode = 1 | 2 | 3 | 4
export type WriteSingleFunctionCode = 5 | 6
export type WriteMultiFunctionCode = 15 | 16
export type WriteFunctionCode = WriteSingleFunctionCode | WriteMultiFunctionCode

// Modbus related types
export interface ModbusReadConfig {
  slaveId: number
  functionCode: ReadFunctionCode
  startAddress: number
  quantity: number
}

export interface ModbusWriteConfig {
  slaveId: number
  functionCode: WriteFunctionCode
  address: number
  value: number | number[]
}

export interface ModbusResponse {
  slaveId: number
  functionCode: number
  data: number[]
  address?: number
  timestamp: Date
}
