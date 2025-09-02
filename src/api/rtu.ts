// RTU-specific pure function API extracted from pure-functions.ts
// Provides a functional interface for Modbus RTU without bundling ASCII logic
import { ModbusExceptionError } from "../errors.ts";
import { buildReadRequest, buildWriteRequest } from "../frameBuilder.ts";
import {
  getExpectedResponseLength,
  parseBitResponse,
  parseRegisterResponse,
  validateRTUFrame,
} from "../frameParser.ts";
import { FUNCTION_CODE_LABELS, isValidFunctionCode } from "../functionCodes.ts";
import type { ModbusResponse } from "../modbus-base.ts";
import type { IModbusTransport } from "../transport/transport.ts";
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
      "rtu",
    );
    const responseResult = await sendRTURequestAndWait(
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
      const dataLength = responseData[2];
      data = parseRegisterResponse(Array.from(responseData), dataLength);
    } else if (request.functionCode === 1 || request.functionCode === 2) {
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
      "rtu",
    );
    const responseResult = await sendRTURequestAndWait(
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

async function sendRTURequestAndWait(
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
      const reason = signal && (signal as AbortSignal).reason;
      resolve(err(reason instanceof Error ? reason : new Error("Aborted")));
    };
    const buffer: number[] = [];
    const onMessage = (ev: Event) => {
      const data = (ev as CustomEvent<Uint8Array>).detail;
      if (!data) return; // defensive
      buffer.push(...Array.from(data));
      while (buffer.length >= 5) {
        const unitId = buffer[0];
        const functionCode = buffer[1];
        const isMatch =
          unitId === expectedUnitId &&
          (functionCode === expectedFunctionCode ||
            (functionCode & 0x80 &&
              (functionCode & 0x7f) === expectedFunctionCode));
        if (!isMatch) {
          buffer.shift();
          continue;
        }
        if (functionCode & 0x80) {
          if (buffer.length >= 5) {
            const errorCode = buffer[2];
            cleanup();
            resolve(err(new ModbusExceptionError(errorCode)));
            return;
          }
          break;
        }
        const expectedLength = getExpectedResponseLength(buffer);
        if (expectedLength === -1) {
          buffer.shift();
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
            buffer.shift();
            continue;
          }
        }
        break;
      }
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
      transportRemove();
      if (signal) signal.removeEventListener("abort", abortHandler);
    };
    const transportRemove = () => {
      // removeEventListener 未実装のため AbortSignal で一括解除想定 → ここでは no-op
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
