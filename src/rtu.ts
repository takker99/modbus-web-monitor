// RTU-specific pure function API extracted from pure-functions.ts
// Provides a functional interface for Modbus RTU without bundling ASCII logic
import {
  createErr,
  createOk,
  isErr,
  type Result,
  unwrapOk,
} from "option-t/plain_result";
import { ModbusExceptionError } from "./errors.ts";
import { toReadPDU, toRTUFrame, toWritePDU } from "./frameBuilder.ts";
import {
  getExpectedResponseLength,
  parseBitResponse,
  parseRegisterResponse,
  parseRTUFrame,
} from "./frameParser.ts";
import { isRegisterBasedFunctionCode } from "./functionCodes.ts";
import type {
  ModbusResponse,
  ReadRequest,
  RequestOptions,
  WriteRequest,
} from "./modbus.ts";
import { byteStreamFromTransport } from "./stream.ts";
import type { IModbusTransport } from "./transport/transport.ts";

/**
 * Async generator that consumes raw byte chunks and yields validated RTU frames
 * (full raw frame bytes including CRC) while performing resynchronisation.
 *
 * Contract:
 *  - Yields only frames that pass `parseRTUFrame` (CRC OK, structure OK)
 *  - Discards / shifts one byte on parse or CRC failure to resync
 *  - Scans for expected function code match performed by caller (to keep it generic)
 *  - Stops when upstream iterable ends (partial trailing data ignored)
 */
export async function* rtuFrameStream(
  source: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array, void, unknown> {
  const buffer: number[] = [];
  try {
    for await (const chunk of source) {
      buffer.push(...chunk);
      // Attempt extraction loop
      while (buffer.length >= 5) {
        // We don't know expected length until we have at least address+fc+maybe bytecount
        const expectedLength = getExpectedResponseLength(buffer);
        if (expectedLength === -1) {
          // Can't determine yet or invalid start -> shift one for resync
          buffer.shift();
          continue;
        }
        if (buffer.length < expectedLength) break; // need more bytes
        const candidate = buffer.slice(0, expectedLength);
        const parsed = parseRTUFrame(candidate);
        if (isErr(parsed)) {
          // CRC / format fail -> discard first byte and retry
          buffer.shift();
          continue;
        }
        yield new Uint8Array(candidate);
        buffer.splice(0, expectedLength); // remove emitted frame
      }
    }
  } catch (e) {
    // Propagate abort separately (consumer can decide), others rethrow
    if (signal?.aborted) return;
    throw e;
  }
}

/** Read coil status bits (FC01) using RTU protocol. */
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
/** Read discrete input status bits (FC02) using RTU protocol. */
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
/** Read holding registers (FC03) using RTU protocol. */
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
/** Read input registers (FC04) using RTU protocol. */
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

/** Write a single coil (FC05) using RTU protocol. */
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
/** Write a single register (FC06) using RTU protocol. */
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
/** Write multiple coils (FC15) using RTU protocol. */
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
/** Write multiple registers (FC16) using RTU protocol. */
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

/** Low-level generic read helper shared by exported RTU read functions. */
export async function read(
  transport: IModbusTransport,
  request: ReadRequest,
  options?: RequestOptions,
): Promise<Result<ModbusResponse, Error>> {
  if (!transport.connected)
    return createErr(new Error("Transport not connected"));
  try {
    const requestFrame = toRTUFrame(toReadPDU(request));
    const responseResult = await send(
      transport,
      requestFrame,
      request.slaveId,
      request.functionCode,
      options?.signal,
    );
    if (isErr(responseResult)) return responseResult;
    const responseData = unwrapOk(responseResult);
    const data: number[] = (
      isRegisterBasedFunctionCode(request.functionCode)
        ? parseRegisterResponse
        : parseBitResponse
    )(Array.from(responseData), responseData[2]);
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

/** Low-level generic write helper shared by exported RTU write functions. */
export async function write(
  transport: IModbusTransport,
  request: WriteRequest,
  options?: RequestOptions,
): Promise<Result<void, Error>> {
  if (!transport.connected)
    return createErr(new Error("Transport not connected"));
  try {
    const requestFrame = toRTUFrame(toWritePDU(request));
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
 * Core RTU request/response exchange helper.
 * Performs resynchronisation scanning, CRC validation and exception mapping.
 */
async function send(
  transport: IModbusTransport,
  requestFrame: Uint8Array,
  expectedUnitId: number,
  expectedFunctionCode: number,
  signal?: AbortSignal,
): Promise<Result<Uint8Array, Error>> {
  if (signal?.aborted) {
    return createErr(
      signal.reason instanceof Error ? signal.reason : new Error("Aborted"),
    );
  }
  try {
    transport.postMessage(requestFrame);
  } catch (e) {
    return createErr(e as Error);
  }
  const chunkStream = byteStreamFromTransport(transport, { signal });
  try {
    for await (const frame of rtuFrameStream(chunkStream, signal)) {
      const unitId = frame[0];
      const functionCode = frame[1];
      const match =
        unitId === expectedUnitId &&
        (functionCode === expectedFunctionCode ||
          (functionCode & 0x80 &&
            (functionCode & 0x7f) === expectedFunctionCode));
      if (!match) continue; // ignore unrelated frame
      if (functionCode & 0x80) {
        const errCode = frame[2];
        return createErr(new ModbusExceptionError(errCode));
      }
      return createOk(frame);
    }
    // Distinguish abort-driven termination from natural end-of-stream
    if (signal?.aborted) {
      return createErr(
        signal.reason instanceof Error ? signal.reason : new Error("Aborted"),
      );
    }
    return createErr(new Error("Stream ended before frame complete"));
  } catch (e) {
    return createErr(e as Error);
  }
}
