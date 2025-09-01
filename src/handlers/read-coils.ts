// Handler for Modbus Function Code 01: Read Coils
// Reads the status of coils (discrete outputs) from a slave device

import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import type { ModbusResponse } from "../modbus-base.ts";
import { ok, err } from "../types/result.ts";
import { buildReadRequest } from "../frameBuilder.ts";
import { parseBitResponse } from "../frameParser.ts";
import { FUNCTION_CODE_LABELS } from "../functionCodes.ts";
import { sendRequestAndWaitForResponse } from "./common.ts";

export interface ReadCoilsRequest {
  unitId: number;
  address: number;
  quantity: number;
}

export interface ReadCoilsOptions {
  timeout?: number; // Default: 3000ms
  protocol?: "rtu" | "ascii"; // Default: "rtu"
}

/**
 * Read Coils (Function Code 01)
 * Reads the ON/OFF status of discrete outputs (coils) in the slave device.
 * 
 * @param transport - Modbus transport instance
 * @param request - Read coils request parameters
 * @param options - Request options (timeout, protocol)
 * @returns Promise<Result<ModbusResponse, Error>>
 */
export async function readCoils(
  transport: IModbusTransport,
  request: ReadCoilsRequest,
  options: ReadCoilsOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  const protocol = options.protocol || "rtu";
  const timeout = options.timeout || 3000;

  if (!transport.connected) {
    return err(new Error("Transport not connected"));
  }

  if (request.quantity < 1 || request.quantity > 2000) {
    return err(new Error("Invalid quantity: must be between 1 and 2000"));
  }

  if (request.address < 0 || request.address > 65535) {
    return err(new Error("Invalid address: must be between 0 and 65535"));
  }

  try {
    // Build request frame
    const requestConfig = {
      slaveId: request.unitId,
      functionCode: 1 as const,
      startAddress: request.address,
      quantity: request.quantity,
    };
    const requestFrame = buildReadRequest(requestConfig, protocol);

    // Send request and wait for response
    const responseResult = await sendRequestAndWaitForResponse(
      transport,
      requestFrame,
      request.unitId,
      1,
      protocol,
      timeout,
    );

    if (!responseResult.success) {
      return responseResult;
    }

    const responseData = responseResult.data;

    // Parse response data for coils (bit-based data)
    const dataLength = responseData[2];
    const data = parseBitResponse(Array.from(responseData), dataLength);

    const response: ModbusResponse = {
      slaveId: request.unitId,
      functionCode: 1,
      functionCodeLabel: FUNCTION_CODE_LABELS[1],
      data,
      address: request.address,
      timestamp: new Date(),
    };

    return ok(response);
  } catch (error) {
    return err(error as Error);
  }
}