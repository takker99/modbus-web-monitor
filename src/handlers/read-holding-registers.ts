// Handler for Modbus Function Code 03: Read Holding Registers
// Reads the contents of holding registers from a slave device

import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import type { ModbusResponse } from "../modbus-base.ts";
import { ok, err } from "../types/result.ts";
import { buildReadRequest } from "../frameBuilder.ts";
import { parseRegisterResponse } from "../frameParser.ts";
import { FUNCTION_CODE_LABELS } from "../functionCodes.ts";
import { sendRequestAndWaitForResponse } from "./common.ts";

export interface ReadHoldingRegistersRequest {
  unitId: number;
  address: number;
  quantity: number;
}

export interface ReadHoldingRegistersOptions {
  timeout?: number; // Default: 3000ms
  protocol?: "rtu" | "ascii"; // Default: "rtu"
}

/**
 * Read Holding Registers (Function Code 03)
 * Reads the contents of contiguous holding registers in the slave device.
 * 
 * @param transport - Modbus transport instance
 * @param request - Read holding registers request parameters
 * @param options - Request options (timeout, protocol)
 * @returns Promise<Result<ModbusResponse, Error>>
 */
export async function readHoldingRegisters(
  transport: IModbusTransport,
  request: ReadHoldingRegistersRequest,
  options: ReadHoldingRegistersOptions = {},
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
      functionCode: 3 as const,
      startAddress: request.address,
      quantity: request.quantity,
    };
    const requestFrame = buildReadRequest(requestConfig, protocol);

    // Send request and wait for response
    const responseResult = await sendRequestAndWaitForResponse(
      transport,
      requestFrame,
      request.unitId,
      3,
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
      functionCode: 3,
      functionCodeLabel: FUNCTION_CODE_LABELS[3],
      data,
      address: request.address,
      timestamp: new Date(),
    };

    return ok(response);
  } catch (error) {
    return err(error as Error);
  }
}