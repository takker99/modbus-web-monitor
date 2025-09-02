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

/** Configuration object for a Modbus read (FC01-04) request. */
export interface ReadRequest {
  slaveId: number;
  functionCode: ReadFunctionCode;
  address: number;
  quantity: number;
}

/** Configuration object for a Modbus write (FC05/06/15/16) request. */
export interface WriteRequest {
  slaveId: number;
  functionCode: WriteFunctionCode;
  address: number;
  value: number | number[];
}

/** Optional per-request controls (AbortSignal etc.). */
export interface RequestOptions {
  signal?: AbortSignal;
}
