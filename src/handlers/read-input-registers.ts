// Handler for Modbus Function Code 04: Read Input Registers
// Reads the contents of input registers from a slave device

import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import type { ModbusResponse } from "../modbus-base.ts";
import { ok, err } from "../types/result.ts";
import { buildReadRequest } from "../frameBuilder.ts";
import { parseRegisterResponse } from "../frameParser.ts";
import { FUNCTION_CODE_LABELS } from "../functionCodes.ts";
import { sendRequestAndWaitForResponse } from "./common.ts";

export interface ReadInputRegistersRequest {
  unitId: number;
  address: number;
  quantity: number;
}

export interface ReadInputRegistersOptions {
  timeout?: number; // Default: 3000ms
  protocol?: "rtu" | "ascii"; // Default: "rtu"
}

/**
 * Read Input Registers (Function Code 04)
 * Reads the contents of contiguous input registers in the slave device.
 * 
 * @param transport - Modbus transport instance
 * @param request - Read input registers request parameters
 * @param options - Request options (timeout, protocol)
 * @returns Promise<Result<ModbusResponse, Error>>
 */
export async function readInputRegisters(
  transport: IModbusTransport,
  request: ReadInputRegistersRequest,
  options: ReadInputRegistersOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  const protocol = options.protocol || "rtu";
  const timeout = options.timeout || 3000;

  if (!transport.connected) {
    return err(new Error("Transport not connected"));
  }

  if (request.quantity < 1 || request.quantity > 125) {
    return err(new Error("Invalid quantity: must be between 1 and 125"));
  }

  if (request.address < 0 || request.address > 65535) {
    return err(new Error("Invalid address: must be between 0 and 65535"));
  }

  try {
    // Build request frame
    const requestConfig = {
      slaveId: request.unitId,
      functionCode: 4 as const,
      startAddress: request.address,
      quantity: request.quantity,
    };
    const requestFrame = buildReadRequest(requestConfig, protocol);

    // Send request and wait for response
    const responseResult = await sendRequestAndWaitForResponse(
      transport,
      requestFrame,
      request.unitId,
      4,
      protocol,
      timeout,
    );

    if (!responseResult.success) {
      return responseResult;
    }

    const responseData = responseResult.data;

    // Parse response data for registers
    const dataLength = responseData[2];
    const data = parseRegisterResponse(Array.from(responseData), dataLength);

    const response: ModbusResponse = {
      slaveId: request.unitId,
      functionCode: 4,
      functionCodeLabel: FUNCTION_CODE_LABELS[4],
      data,
      address: request.address,
      timestamp: new Date(),
    };

    return ok(response);
  } catch (error) {
    return err(error as Error);
  }
}