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

// Runtime type guard functions for safe function code validation
export function isReadFunctionCode(code: number): code is ReadFunctionCode {
  return code === 1 || code === 2 || code === 3 || code === 4
}

export function isWriteFunctionCode(code: number): code is WriteFunctionCode {
  return code === 5 || code === 6 || code === 15 || code === 16
}

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

// Extended interface for the UI state (includes additional fields for multi-value input)
export interface ModbusWriteUIConfig {
  address: number
  functionCode: WriteFunctionCode
  multiValues: string // For multi-write input (comma-separated or multi-line)
  quantity: number // For multi-writes (FC15/16)
  value: string // For single-value input
}

export interface ModbusResponse {
  slaveId: number
  functionCode: number
  data: number[]
  address?: number
  timestamp: Date
}
