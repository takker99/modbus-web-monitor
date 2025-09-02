/**
 * High-level Modbus response object used by the client API and UI.
 */
export interface ModbusResponse {
  /** Slave device identifier. */
  slaveId: number;
  /** Function code (without exception bit). */
  functionCode: number;
  /** Human-readable label for the function code. */
  functionCodeLabel: string;
  /** Decoded data payload (registers or bits). */
  data: number[];
  /** Optional address associated with the response (if applicable). */
  address?: number;
  /** Timestamp when the response was created. */
  timestamp: Date;
}

/**
 * Configuration for read requests.
 */
export interface ModbusReadConfig {
  slaveId: number;
  functionCode: 1 | 2 | 3 | 4;
  startAddress: number;
  quantity: number;
}

/**
 * Configuration for write requests.
 */
export interface ModbusWriteConfig {
  slaveId: number;
  functionCode: 5 | 6 | 15 | 16;
  address: number;
  value: number | number[];
}
