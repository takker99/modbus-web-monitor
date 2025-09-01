// Handler for Modbus Function Code 05: Write Single Coil
// Writes a single coil to a slave device

import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import { ok, err } from "../types/result.ts";
import { buildWriteRequest } from "../frameBuilder.ts";
import { sendRequestAndWaitForResponse } from "./common.ts";

export interface WriteSingleCoilRequest {
  unitId: number;
  address: number;
  value: boolean;
}

export interface WriteSingleCoilOptions {
  timeout?: number; // Default: 3000ms
  protocol?: "rtu" | "ascii"; // Default: "rtu"
}

/**
 * Write Single Coil (Function Code 05)
 * Forces a single coil to either ON or OFF in the slave device.
 * 
 * @param transport - Modbus transport instance
 * @param request - Write single coil request parameters
 * @param options - Request options (timeout, protocol)
 * @returns Promise<Result<void, Error>>
 */
export async function writeSingleCoil(
  transport: IModbusTransport,
  request: WriteSingleCoilRequest,
  options: WriteSingleCoilOptions = {},
): Promise<Result<void, Error>> {
  const protocol = options.protocol || "rtu";
  const timeout = options.timeout || 3000;

  if (!transport.connected) {
    return err(new Error("Transport not connected"));
  }

  if (request.address < 0 || request.address > 65535) {
    return err(new Error("Invalid address: must be between 0 and 65535"));
  }

  try {
    // Build request frame
    const requestConfig = {
      slaveId: request.unitId,
      functionCode: 5 as const,
      address: request.address,
      value: request.value ? 1 : 0,
    };
    const requestFrame = buildWriteRequest(requestConfig, protocol);

    // Send request and wait for response
    const responseResult = await sendRequestAndWaitForResponse(
      transport,
      requestFrame,
      request.unitId,
      5,
      protocol,
      timeout,
    );

    if (!responseResult.success) {
      return responseResult;
    }

    // For write operations, we just need to verify we got a valid response
    // The response should echo back the request data
    const responseData = responseResult.data;
    
    // Verify response structure for single coil write
    if (responseData.length < 6) {
      return err(new Error("Invalid response length for single coil write"));
    }

    const responseAddress = (responseData[2] << 8) | responseData[3];
    const responseValue = (responseData[4] << 8) | responseData[5];
    
    // Verify the response matches our request
    if (responseAddress !== request.address) {
      return err(new Error(`Address mismatch in response: expected ${request.address}, got ${responseAddress}`));
    }
    
    const expectedValue = request.value ? 0xFF00 : 0x0000;
    if (responseValue !== expectedValue) {
      return err(new Error(`Value mismatch in response: expected ${expectedValue.toString(16)}, got ${responseValue.toString(16)}`));
    }

    return ok(undefined);
  } catch (error) {
    return err(error as Error);
  }
}