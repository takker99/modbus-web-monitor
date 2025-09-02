// ASCII-specific pure function API extracted from pure-functions.ts
// Provides a functional interface for Modbus ASCII without bundling RTU logic
import { ModbusExceptionError } from "../errors.ts";
import { buildReadRequest, buildWriteRequest } from "../frameBuilder.ts";
import {
  parseBitData,
  parseRegisterData,
  validateASCIIFrame,
} from "../frameParser.ts";
import { FUNCTION_CODE_LABELS, isValidFunctionCode } from "../functionCodes.ts";
import type { IModbusTransport } from "../transport/transport.ts";
import type { ModbusResponse } from "../types/modbus.ts";
import type { Result } from "../types/result.ts";
import { err, ok } from "../types/result.ts";

export interface ReadRequest {
  unitId: number;
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
  signal?: AbortSignal;
}

export async function readCoils(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  return executeReadRequest(
    transport,
    { address, functionCode: 1, quantity, unitId },
    options,
  );
}
export async function readDiscreteInputs(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  return executeReadRequest(
    transport,
    { address, functionCode: 2, quantity, unitId },
    options,
  );
}
export async function readHoldingRegisters(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  return executeReadRequest(
    transport,
    { address, functionCode: 3, quantity, unitId },
    options,
  );
}
export async function readInputRegisters(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  quantity: number,
  options: RequestOptions = {},
): Promise<Result<ModbusResponse, Error>> {
  return executeReadRequest(
    transport,
    { address, functionCode: 4, quantity, unitId },
    options,
  );
}

export async function writeSingleCoil(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  value: boolean,
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  return executeWriteRequest(
    transport,
    { address, functionCode: 5, unitId, value: value ? 1 : 0 },
    options,
  );
}
export async function writeSingleRegister(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  value: number,
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  return executeWriteRequest(
    transport,
    { address, functionCode: 6, unitId, value },
    options,
  );
}
export async function writeMultipleCoils(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  values: boolean[],
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  return executeWriteRequest(
    transport,
    {
      address,
      functionCode: 15,
      unitId,
      value: values.map((v) => (v ? 1 : 0)),
    },
    options,
  );
}
export async function writeMultipleRegisters(
  transport: IModbusTransport,
  unitId: number,
  address: number,
  values: number[],
  options: RequestOptions = {},
): Promise<Result<void, Error>> {
  return executeWriteRequest(
    transport,
    { address, functionCode: 16, unitId, value: values },
    options,
  );
}

async function executeReadRequest(
  transport: IModbusTransport,
  request: ReadRequest,
  options: RequestOptions,
): Promise<Result<ModbusResponse, Error>> {
  if (!transport.connected) return err(new Error("Transport not connected"));
  try {
    const requestFrame = buildReadRequest(
      {
        functionCode: request.functionCode,
        quantity: request.quantity,
        slaveId: request.unitId,
        startAddress: request.address,
      },
      "ascii",
    );
    const responseResult = await sendASCIIRequestAndWait(
      transport,
      requestFrame,
      request.unitId,
      request.functionCode,
      options.signal,
    );
    if (!responseResult.success) return responseResult;
    const responseData = responseResult.data;
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
      functionCodeLabel: isValidFunctionCode(request.functionCode)
        ? FUNCTION_CODE_LABELS[request.functionCode]
        : `Unknown (${request.functionCode})`,
      slaveId: request.unitId,
      timestamp: new Date(),
    };
    return ok(response);
  } catch (e) {
    return err(e as Error);
  }
}

async function executeWriteRequest(
  transport: IModbusTransport,
  request: WriteRequest,
  options: RequestOptions,
): Promise<Result<void, Error>> {
  if (!transport.connected) return err(new Error("Transport not connected"));
  try {
    const requestFrame = buildWriteRequest(
      {
        address: request.address,
        functionCode: request.functionCode,
        slaveId: request.unitId,
        value: request.value,
      },
      "ascii",
    );
    const responseResult = await sendASCIIRequestAndWait(
      transport,
      requestFrame,
      request.unitId,
      request.functionCode,
      options.signal,
    );
    if (!responseResult.success) return responseResult;
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}

async function sendASCIIRequestAndWait(
  transport: IModbusTransport,
  requestFrame: Uint8Array,
  expectedUnitId: number,
  expectedFunctionCode: number,
  signal?: AbortSignal,
): Promise<Result<Uint8Array, Error>> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(
        err(
          signal.reason instanceof Error ? signal.reason : new Error("Aborted"),
        ),
      );
      return;
    }
    const abortHandler = () => {
      cleanup();
      const r = signal?.reason;
      resolve(err(r instanceof Error ? r : new Error("Aborted")));
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
        if (validation.isValid && validation.frame) {
          const unitId = validation.frame[0];
          const functionCode = validation.frame[1];
          const isMatch =
            unitId === expectedUnitId &&
            (functionCode === expectedFunctionCode ||
              (functionCode & 0x80 &&
                (functionCode & 0x7f) === expectedFunctionCode));
          if (isMatch) {
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
        err(
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
      resolve(err(error as Error));
    }
  });
}
