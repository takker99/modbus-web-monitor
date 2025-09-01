// Pure function API for Modbus operations
// Provides a functional interface that works directly with transports

import { ModbusExceptionError } from "../errors.ts";
import { buildReadRequest, buildWriteRequest } from "../frameBuilder.ts";
import {
  getExpectedResponseLength,
  parseBitResponse,
  parseRegisterResponse,
  validateASCIIFrame,
  validateRTUFrame,
} from "../frameParser.ts";
import { FUNCTION_CODE_LABELS, isValidFunctionCode } from "../functionCodes.ts";
import type { ModbusResponse } from "../modbus-base.ts";
import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import { err, ok } from "../types/result.ts";

// Request configuration types
export interface ReadRequest {
  unitId: number; // Also known as slaveId in RTU context
  functionCode: 1 | 2 | 3 | 4;
  address: number;
  quantity: number;
}

export interface WriteRequest {
  unitId: number;
  functionCode: 5 | 6 | 15 | 16;
  address: number;
  value: number | number[];
}

export interface RequestOptions {
  timeout?: number; // Default: 3000ms
  protocol?: "rtu" | "ascii"; // Default: "rtu"
}

// Pure function to read coils (FC01)
export async function readCoils(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  const request: ReadRequest = {
    address,
    functionCode: 1,
    quantity,
    unitId,
  };

  return await executeReadRequest(transport, request, options);
}

// Pure function to read discrete inputs (FC02)
export async function readDiscreteInputs(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  const request: ReadRequest = {
    address,
    functionCode: 2,
    quantity,
    unitId,
  };

  return await executeReadRequest(transport, request, options);
}

// Pure function to read holding registers (FC03)
export async function readHoldingRegisters(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  const request: ReadRequest = {
    address,
    functionCode: 3,
    quantity,
    unitId,
  };

  return await executeReadRequest(transport, request, options);
}

// Pure function to read input registers (FC04)
export async function readInputRegisters(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  const request: ReadRequest = {
    address,
    functionCode: 4,
    quantity,
    unitId,
  };

  return await executeReadRequest(transport, request, options);
}

// Pure function to write single coil (FC05)
export async function writeSingleCoil(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  value: boolean,
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  const request: WriteRequest = {
    address,
    functionCode: 5,
    unitId,
    value: value ? 1 : 0,
  };

  return await executeWriteRequest(transport, request, options);
}

// Pure function to write single register (FC06)
export async function writeSingleRegister(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  value: number,
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  const request: WriteRequest = {
    address,
    functionCode: 6,
    unitId,
    value,
  };

  return await executeWriteRequest(transport, request, options);
}

// Pure function to write multiple coils (FC15)
export async function writeMultipleCoils(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  values: boolean[],
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  const request: WriteRequest = {
    address,
    functionCode: 15,
    unitId,
    value: values.map((v) => (v ? 1 : 0)),
  };

  return await executeWriteRequest(transport, request, options);
}

// Pure function to write multiple registers (FC16)
export async function writeMultipleRegisters(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  values: number[],
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  const request: WriteRequest = {
    address,
    functionCode: 16,
    unitId,
    value: values,
  };

  return await executeWriteRequest(transport, request, options);
}

// Generic read request executor
async function executeReadRequest(
  transport: IModbusTransport,
  request: ReadRequest,
  options: RequestOptions,
): Promise<Result<ModbusResponse, Error>> {
  const protocol = options.protocol || "rtu";
  const timeout = options.timeout || 3000;

  if (!transport.connected) {
    return err(new Error("Transport not connected"));
  }

  try {
    // Build request frame
    const requestConfig = {
      functionCode: request.functionCode,
      quantity: request.quantity,
      slaveId: request.unitId,
      startAddress: request.address,
    };
    const requestFrame = buildReadRequest(requestConfig, protocol);

    // Send request and wait for response
    const responseResult = await sendRequestAndWaitForResponse(
      transport,
      requestFrame,
      request.unitId,
      request.functionCode,
      protocol,
      timeout,
    );

    if (!responseResult.success) {
      return responseResult;
    }

    const responseData = responseResult.data;

    // Parse response data
    let data: number[] = [];
    if (request.functionCode === 3 || request.functionCode === 4) {
      // Register read response
      const dataLength = responseData[2];
      data = parseRegisterResponse(Array.from(responseData), dataLength);
    } else if (request.functionCode === 1 || request.functionCode === 2) {
      // Bit read response
      const dataLength = responseData[2];
      data = parseBitResponse(Array.from(responseData), dataLength);
    }

    const response: ModbusResponse = {
      address: request.address,
      data,
      functionCode: request.functionCode,
      functionCodeLabel: isValidFunctionCode(request.functionCode)
        ? FUNCTION_CODE_LABELS[request.functionCode]
        : `Unknown (${request.functionCode})`,
      slaveId: request.unitId,
      timestamp: new Date(),
    };

    return ok(response);
  } catch (error) {
    return err(error as Error);
  }
}

// Generic write request executor
async function executeWriteRequest(
  transport: IModbusTransport,
  request: WriteRequest,
  options: RequestOptions,
): Promise<Result<void, Error>> {
  const protocol = options.protocol || "rtu";
  const timeout = options.timeout || 3000;

  if (!transport.connected) {
    return err(new Error("Transport not connected"));
  }

  try {
    // Build request frame
    const requestConfig = {
      address: request.address,
      functionCode: request.functionCode,
      slaveId: request.unitId,
      value: request.value,
    };
    const requestFrame = buildWriteRequest(requestConfig, protocol);

    // Send request and wait for response
    const responseResult = await sendRequestAndWaitForResponse(
      transport,
      requestFrame,
      request.unitId,
      request.functionCode,
      protocol,
      timeout,
    );

    if (!responseResult.success) {
      return responseResult;
    }

    return ok(undefined);
  } catch (error) {
    return err(error as Error);
  }
}

// Helper function to send request and wait for response
async function sendRequestAndWaitForResponse(
  transport: IModbusTransport,
  requestFrame: Uint8Array,
  expectedUnitId: number,
  expectedFunctionCode: number,
  protocol: "rtu" | "ascii",
  timeout: number,
): Promise<Result<Uint8Array, Error>> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(err(new Error("Request timeout")));
    }, timeout);

    const buffer: number[] = [];
    let asciiBuffer = "";

    const onData = (data: Uint8Array) => {
      if (protocol === "rtu") {
        handleRTUData(data);
      } else {
        handleASCIIData(data);
      }
    };

    const onError = (error: Error) => {
      cleanup();
      resolve(err(error));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      transport.off("data", onData);
      transport.off("error", onError);
    };

    const handleRTUData = (data: Uint8Array) => {
      buffer.push(...Array.from(data));

      // Try to find a complete frame
      while (buffer.length >= 5) {
        const unitId = buffer[0];
        const functionCode = buffer[1];

        // Check if this frame matches our expected response
        const isMatch =
          unitId === expectedUnitId &&
          (functionCode === expectedFunctionCode ||
            (functionCode & 0x80 &&
              (functionCode & 0x7f) === expectedFunctionCode));

        if (!isMatch) {
          buffer.shift(); // Remove first byte and try again
          continue;
        }

        // Check for exception response
        if (functionCode & 0x80) {
          if (buffer.length >= 5) {
            const errorCode = buffer[2];
            cleanup();
            resolve(err(new ModbusExceptionError(errorCode)));
            return;
          }
          break; // Need more data
        }

        // Get expected response length
        const expectedLength = getExpectedResponseLength(buffer);
        if (expectedLength === -1) {
          buffer.shift(); // Invalid frame, try next position
          continue;
        }

        if (buffer.length >= expectedLength) {
          const frame = buffer.slice(0, expectedLength);
          const validation = validateRTUFrame(frame);

          if (validation.isValid) {
            cleanup();
            resolve(ok(new Uint8Array(frame)));
            return;
          } else {
            buffer.shift(); // Invalid CRC, try next position
            continue;
          }
        }
        break; // Need more data
      }
    };

    const handleASCIIData = (data: Uint8Array) => {
      const text = new TextDecoder().decode(data);
      asciiBuffer += text;

      // Look for complete frames (: to \r\n)
      let frameStart = 0;
      while (true) {
        const colonIndex = asciiBuffer.indexOf(":", frameStart);
        if (colonIndex === -1) break;

        const endIndex = asciiBuffer.indexOf("\r\n", colonIndex);
        if (endIndex === -1) break;

        const frameString = asciiBuffer.substring(colonIndex, endIndex + 2);
        const validation = validateASCIIFrame(frameString);

        if (validation.isValid && validation.frame) {
          const unitId = validation.frame[0];
          const functionCode = validation.frame[1];

          // Check if this frame matches our expected response
          const isMatch =
            unitId === expectedUnitId &&
            (functionCode === expectedFunctionCode ||
              (functionCode & 0x80 &&
                (functionCode & 0x7f) === expectedFunctionCode));

          if (isMatch) {
            // Check for exception response
            if (functionCode & 0x80) {
              const errorCode = validation.frame[2];
              cleanup();
              resolve(err(new ModbusExceptionError(errorCode)));
              return;
            }

            cleanup();
            resolve(ok(new Uint8Array(validation.frame)));
            return;
          }
        }

        frameStart = endIndex + 2;
      }

      // Clean up processed part of buffer
      if (frameStart > 0) {
        asciiBuffer = asciiBuffer.substring(frameStart);
      }
    };

    transport.on("data", onData);
    transport.on("error", onError);

    // Send the request
    transport.send(requestFrame).catch((error) => {
      cleanup();
      resolve(err(error));
    });
  });
}
