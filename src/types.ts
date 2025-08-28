// シリアル通信設定の型定義
export interface SerialConfig {
  baudRate: number
  dataBits: 7 | 8
  parity: 'none' | 'even' | 'odd'
  stopBits: 1 | 2
}

// Modbus関連の型定義
export interface ModbusReadConfig {
  slaveId: number
  functionCode: number
  startAddress: number
  quantity: number
}

export interface ModbusWriteConfig {
  slaveId: number
  functionCode: number
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
