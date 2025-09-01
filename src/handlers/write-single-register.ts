// Handler for Modbus Function Code 06: Write Single Register
// Writes a single register to a slave device

import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import { ok, err } from "../types/result.ts";
import { buildWriteRequest } from "../frameBuilder.ts";
import { sendRequestAndWaitForResponse } from "./common.ts";

export interface WriteSingleRegisterRequest {
  unitId: number;
  address: number;
  value: number;
}

export interface WriteSingleRegisterOptions {
  timeout?: number; // Default: 3000ms
  protocol?: "rtu" | "ascii"; // Default: "rtu"
}

/**
 * Write Single Register (Function Code 06)
 * Writes a single holding register in the slave device.
 * 
 * @param transport - Modbus transport instance
 * @param request - Write single register request parameters
 * @param options - Request options (timeout, protocol)
 * @returns Promise<Result<void, Error>>
 */
export async function writeSingleRegister(
  transport: IModbusTransport,
  request: WriteSingleRegisterRequest,
  options: WriteSingleRegisterOptions = {},
): Promise<Result<void, Error>> {
  const protocol = options.protocol || "rtu";
  const timeout = options.timeout || 3000;

  if (!transport.connected) {
    return err(new Error("Transport not connected"));
  }

  if (request.address < 0 || request.address > 65535) {
    return err(new Error("Invalid address: must be between 0 and 65535"));
  }

  if (request.value < 0 || request.value > 65535) {
    return err(new Error("Invalid value: must be between 0 and 65535"));
  }

  try {
    // Build request frame
    const requestConfig = {
      slaveId: request.unitId,
      functionCode: 6 as const,
      address: request.address,
      value: request.value,
    };
    const requestFrame = buildWriteRequest(requestConfig, protocol);

    // Send request and wait for response
    const responseResult = await sendRequestAndWaitForResponse(
      transport,
      requestFrame,
      request.unitId,
      6,
      protocol,
      timeout,
    );

    if (!responseResult.success) {
      return responseResult;
    }

    // For write operations, we just need to verify we got a valid response
    // The response should echo back the request data
    const responseData = responseResult.data;
    
    // Verify response structure for single register write
    if (responseData.length < 6) {
      return err(new Error("Invalid response length for single register write"));
    }

    const responseAddress = (responseData[2] << 8) | responseData[3];
    const responseValue = (responseData[4] << 8) | responseData[5];
    
    // Verify the response matches our request
    if (responseAddress !== request.address) {
      return err(new Error(`Address mismatch in response: expected ${request.address}, got ${responseAddress}`));
    }
    
    if (responseValue !== request.value) {
      return err(new Error(`Value mismatch in response: expected ${request.value}, got ${responseValue}`));
    }

    return ok(undefined);
  } catch (error) {
    return err(error as Error);
  }
}