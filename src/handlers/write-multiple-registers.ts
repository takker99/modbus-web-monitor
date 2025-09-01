// Handler for Modbus Function Code 16: Write Multiple Registers
// Writes multiple holding registers to a slave device

import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import { ok, err } from "../types/result.ts";
import { buildWriteRequest } from "../frameBuilder.ts";
import { sendRequestAndWaitForResponse } from "./common.ts";

export interface WriteMultipleRegistersRequest {
  unitId: number;
  address: number;
  values: number[];
}

export interface WriteMultipleRegistersOptions {
  timeout?: number; // Default: 3000ms
  protocol?: "rtu" | "ascii"; // Default: "rtu"
}

/**
 * Write Multiple Registers (Function Code 16)
 * Writes a block of contiguous holding registers in the slave device.
 * 
 * @param transport - Modbus transport instance
 * @param request - Write multiple registers request parameters
 * @param options - Request options (timeout, protocol)
 * @returns Promise<Result<void, Error>>
 */
export async function writeMultipleRegisters(
  transport: IModbusTransport,
  request: WriteMultipleRegistersRequest,
  options: WriteMultipleRegistersOptions = {},
): Promise<Result<void, Error>> {
  const protocol = options.protocol || "rtu";
  const timeout = options.timeout || 3000;

  if (!transport.connected) {
    return err(new Error("Transport not connected"));
  }

  if (request.address < 0 || request.address > 65535) {
    return err(new Error("Invalid address: must be between 0 and 65535"));
  }

  if (!Array.isArray(request.values) || request.values.length === 0) {
    return err(new Error("Values must be a non-empty array"));
  }

  if (request.values.length > 123) {
    return err(new Error("Too many registers: maximum 123 registers per request"));
  }

  // Validate all values are within 16-bit range
  for (let i = 0; i < request.values.length; i++) {
    const value = request.values[i];
    if (value < 0 || value > 65535) {
      return err(new Error(`Invalid value at index ${i}: must be between 0 and 65535`));
    }
  }

  try {
    // Build request frame
    const requestConfig = {
      slaveId: request.unitId,
      functionCode: 16 as const,
      address: request.address,
      value: request.values,
    };
    const requestFrame = buildWriteRequest(requestConfig, protocol);

    // Send request and wait for response
    const responseResult = await sendRequestAndWaitForResponse(
      transport,
      requestFrame,
      request.unitId,
      16,
      protocol,
      timeout,
    );

    if (!responseResult.success) {
      return responseResult;
    }

    // For write multiple operations, verify the response
    const responseData = responseResult.data;
    
    // Verify response structure for multiple registers write
    if (responseData.length < 6) {
      return err(new Error("Invalid response length for multiple registers write"));
    }

    const responseAddress = (responseData[2] << 8) | responseData[3];
    const responseQuantity = (responseData[4] << 8) | responseData[5];
    
    // Verify the response matches our request
    if (responseAddress !== request.address) {
      return err(new Error(`Address mismatch in response: expected ${request.address}, got ${responseAddress}`));
    }
    
    if (responseQuantity !== request.values.length) {
      return err(new Error(`Quantity mismatch in response: expected ${request.values.length}, got ${responseQuantity}`));
    }

    return ok(undefined);
  } catch (error) {
    return err(error as Error);
  }
}