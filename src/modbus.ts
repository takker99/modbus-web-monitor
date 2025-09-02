import type { ReadFunctionCode, WriteFunctionCode } from "./functionCodes";

/**
 * High-level Modbus response object used by the client API and UI.
 */
export interface ModbusResponse {
  /** Slave device identifier. */
  slaveId: number;
  /** Function code (without exception bit). */
  functionCode: number;
  /** Decoded data payload (registers or bits). */
  data: number[];
  /** Optional address associated with the response (if applicable). */
  address?: number;
  /** Timestamp when the response was created. */
  timestamp: Date;
}

export interface ReadRequest {
  slaveId: number;
  functionCode: ReadFunctionCode;
  address: number;
  quantity: number;
}

export interface WriteRequest {
  slaveId: number;
  functionCode: WriteFunctionCode;
  address: number;
  value: number | number[];
}

export interface RequestOptions {
  signal?: AbortSignal;
}
