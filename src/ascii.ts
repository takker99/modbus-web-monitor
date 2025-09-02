// ASCII-specific pure function API extracted from pure-functions.ts
// Provides a functional interface for Modbus ASCII without bundling RTU logic

import {
  createErr,
  createOk,
  isErr,
  isOk,
  type Result,
  unwrapOk,
} from "option-t/plain_result";
import { type MODBUS_EXCEPTION_CODES, ModbusExceptionError } from "./errors.ts";
import { buildReadRequest, buildWriteRequest } from "./frameBuilder.ts";
import {
  parseBitData,
  parseRegisterData,
  validateASCIIFrame,
} from "./frameParser.ts";
import type {
  ModbusResponse,
  ReadRequest,
  RequestOptions,
  WriteRequest,
} from "./modbus.ts";
import type { IModbusTransport } from "./transport/transport.ts";

/** Read coil status bits (FC01) using ASCII protocol. */
export async function readCoils(
  transport: IModbusTransport,
  slaveId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  return read(
    transport,
    { address, functionCode: 1, quantity, slaveId },
    options,
  );
}
/** Read discrete input status bits (FC02) using ASCII protocol. */
export async function readDiscreteInputs(
  transport: IModbusTransport,
  slaveId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  return read(
    transport,
    { address, functionCode: 2, quantity, slaveId },
    options,
  );
}
/** Read holding registers (FC03) using ASCII protocol. */
export async function readHoldingRegisters(
  transport: IModbusTransport,
  slaveId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  return read(
    transport,
    { address, functionCode: 3, quantity, slaveId },
    options,
  );
}
/** Read input registers (FC04) using ASCII protocol. */
export async function readInputRegisters(
  transport: IModbusTransport,
  slaveId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  return read(
    transport,
    { address, functionCode: 4, quantity, slaveId },
    options,
  );
}

/** Write a single coil (FC05) using ASCII protocol. */
export async function writeSingleCoil(
  transport: IModbusTransport,
  slaveId: number,
  address: number,
  value: boolean,
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  return write(
    transport,
    { address, functionCode: 5, slaveId, value: value ? 1 : 0 },
    options,
  );
}
/** Write a single register (FC06) using ASCII protocol. */
export async function writeSingleRegister(
  transport: IModbusTransport,
  slaveId: number,
  address: number,
  value: number,
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  return write(
    transport,
    { address, functionCode: 6, slaveId, value },
    options,
  );
}
/** Write multiple coils (FC15) using ASCII protocol. */
export async function writeMultipleCoils(
  transport: IModbusTransport,
  slaveId: number,
  address: number,
  values: boolean[],
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  return write(
    transport,
    {
      address,
      functionCode: 15,
      slaveId,
      value: values.map((v) => (v ? 1 : 0)),
    },
    options,
  );
}
/** Write multiple registers (FC16) using ASCII protocol. */
export async function writeMultipleRegisters(
  transport: IModbusTransport,
  slaveId: number,
  address: number,
  values: number[],
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  return write(
    transport,
    { address, functionCode: 16, slaveId, value: values },
    options,
  );
}

/** Low-level generic read helper shared by exported ASCII read functions. */
export async function read(
  transport: IModbusTransport,
  request: ReadRequest,
  options?: RequestOptions,
): Promise<Result<ModbusResponse, Error>> {
  if (!transport.connected)
    return createErr(new Error("Transport not connected"));
  try {
    const requestFrame = buildReadRequest(request, "ascii");
    const responseResult = await send(
      transport,
      requestFrame,
      request.slaveId,
      request.functionCode,
      options?.signal,
    );
    if (isErr(responseResult)) return responseResult;
    const responseData = unwrapOk(responseResult);
    let data: number[] = [];
    if (request.functionCode === 3 || request.functionCode === 4) {
      const full = Array.from(responseData);
      const regBytes = full.slice(2); // skip slaveId, functionCode
      data = parseRegisterData(regBytes);
    } else if (request.functionCode === 1 || request.functionCode === 2) {
      const full = Array.from(responseData);
      const bitBytes = full.slice(2);
      data = parseBitData(bitBytes, request.quantity);
    }
    const response: ModbusResponse = {
      address: request.address,
      data,
      functionCode: request.functionCode,
      slaveId: request.slaveId,
      timestamp: new Date(),
    };
    return createOk(response);
  } catch (e) {
    return createErr(e as Error);
  }
}

/** Low-level generic write helper shared by exported ASCII write functions. */
export async function write(
  transport: IModbusTransport,
  request: WriteRequest,
  options?: RequestOptions,
): Promise<Result<void, Error>> {
  if (!transport.connected)
    return createErr(new Error("Transport not connected"));
  try {
    const requestFrame = buildWriteRequest(request, "ascii");
    const responseResult = await send(
      transport,
      requestFrame,
      request.slaveId,
      request.functionCode,
      options?.signal,
    );
    if (isErr(responseResult)) return responseResult;
    return createOk(undefined);
  } catch (e) {
    return createErr(e as Error);
  }
}

/**
 * Core ASCII request/response exchange helper.
 * Handles streaming accumulation, frame boundary detection, LRC validation
 * and exception frame mapping.
 */
async function send(
  transport: IModbusTransport,
  requestFrame: Uint8Array,
  expectedUnitId: number,
  expectedFunctionCode: number,
  signal?: AbortSignal,
): Promise<Result<Uint8Array, Error>> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(
        createErr(
          signal.reason instanceof Error ? signal.reason : new Error("Aborted"),
        ),
      );
      return;
    }
    const abortHandler = () => {
      cleanup();
      const r = signal?.reason;
      resolve(createErr(r instanceof Error ? r : new Error("Aborted")));
    };
    let asciiBuffer = "";
    const onMessage = (ev: Event) => {
      const data = (ev as CustomEvent<Uint8Array>).detail;
      if (!data) return;
      const text = new TextDecoder().decode(data);
      asciiBuffer += text;
      let frameStart = 0;
      while (true) {
        const colonIndex = asciiBuffer.indexOf(":", frameStart);
        if (colonIndex === -1) break;
        const endIndex = asciiBuffer.indexOf("\r\n", colonIndex);
        if (endIndex === -1) break;
        const frameString = asciiBuffer.substring(colonIndex, endIndex + 2);
        const validation = validateASCIIFrame(frameString);
        if (isOk(validation)) {
          const frame = unwrapOk(validation);
          const unitId = frame[0];
          const functionCode = frame[1];
          const isMatch =
            unitId === expectedUnitId &&
            (functionCode === expectedFunctionCode ||
              (functionCode & 0x80 &&
                (functionCode & 0x7f) === expectedFunctionCode));
          if (isMatch) {
            if (functionCode & 0x80) {
              const errorCode = frame[2];
              cleanup();
              resolve(
                createErr(
                  new ModbusExceptionError(
                    errorCode as keyof typeof MODBUS_EXCEPTION_CODES,
                  ),
                ),
              );
              return;
            }
            cleanup();
            resolve(createOk(new Uint8Array(frame)));
            return;
          }
        }
        frameStart = endIndex + 2;
      }
      if (frameStart > 0) asciiBuffer = asciiBuffer.substring(frameStart);
    };
    const onError = (ev: Event) => {
      cleanup();
      const errorEvent = ev as CustomEvent<Error> & { error?: unknown };
      const possible =
        (errorEvent.detail as unknown) ??
        (errorEvent as { error?: unknown }).error;
      const sourceErr = possible || new Error("Unknown error");
      resolve(
        createErr(
          sourceErr instanceof Error ? sourceErr : new Error(String(sourceErr)),
        ),
      );
    };
    const cleanup = () => {
      if (signal) signal.removeEventListener("abort", abortHandler);
    };
    signal?.addEventListener("abort", abortHandler, { once: true });
    transport.addEventListener("message", onMessage, { signal });
    transport.addEventListener("error", onError, { signal });
    try {
      transport.postMessage(requestFrame);
    } catch (error) {
      cleanup();
      resolve(createErr(error as Error));
    }
  });
}
