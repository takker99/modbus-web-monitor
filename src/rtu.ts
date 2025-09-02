// RTU-specific pure function API extracted from pure-functions.ts
// Provides a functional interface for Modbus RTU without bundling ASCII logic
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
  getExpectedResponseLength,
  parseBitResponse,
  parseRegisterResponse,
  validateRTUFrame,
} from "./frameParser.ts";
import type {
  ModbusResponse,
  ReadRequest,
  RequestOptions,
  WriteRequest,
} from "./modbus.ts";
import type { IModbusTransport } from "./transport/transport.ts";

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

export async function read(
  transport: IModbusTransport,
  request: ReadRequest,
  options?: RequestOptions,
): Promise<Result<ModbusResponse, Error>> {
  if (!transport.connected)
    return createErr(new Error("Transport not connected"));
  try {
    const requestFrame = buildReadRequest(request, "rtu");
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
      slaveId: request.slaveId,
      timestamp: new Date(),
    };
    return createOk(response);
  } catch (e) {
    return createErr(e as Error);
  }
}

export async function write(
  transport: IModbusTransport,
  request: WriteRequest,
  options?: RequestOptions,
): Promise<Result<void, Error>> {
  if (!transport.connected)
    return createErr(new Error("Transport not connected"));
  try {
    const requestFrame = buildWriteRequest(request, "rtu");
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
      const reason = signal && (signal as AbortSignal).reason;
      resolve(
        createErr(reason instanceof Error ? reason : new Error("Aborted")),
      );
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
            resolve(
              createErr(
                new ModbusExceptionError(
                  errorCode as keyof typeof MODBUS_EXCEPTION_CODES,
                ),
              ),
            );
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
          if (isOk(validation)) {
            cleanup();
            resolve(createOk(new Uint8Array(frame)));
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
        createErr(
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
      resolve(createErr(error as Error));
    }
  });
}
