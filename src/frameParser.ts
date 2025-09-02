/**
 * Pure functions for parsing Modbus frames and responses.
 */

import {
  createErr,
  createOk,
  isErr,
  type Result,
  unwrapOk,
} from "option-t/plain_result";
import { calculateCRC16 } from "./crc.ts";
import { ModbusCRCError, ModbusFrameError, ModbusLRCError } from "./errors.ts";
import { isFunctionCode } from "./functionCodes.ts";
import { calculateLRC } from "./lrc.ts";

/**
 * Parsed frame shape returned by the parsers.
 */
export interface ParsedFrame {
  /** Slave device identifier. */
  slaveId: number;
  /** Function code without exception bit. */
  functionCode: number;
  /** Raw payload bytes (for RTU this omits CRC). */
  data: number[];
  /** Whether this frame is an exception/ error frame. */
  isException: boolean;
  /** Optional Modbus exception code when isException is true. */
  exceptionCode?: number;
}

/**
 * Utility function to parse bit-based responses (FC01/FC02).
 *
 * Backwards-compatible helper that extracts up to `dataLength` bytes of
 * bit-packed data starting at the standard response offset.
 *
 * @param responseData - Complete RTU response as a byte array.
 * @param dataLength - Number of data bytes that hold bit-packed values.
 * @returns Array of bit values (0 or 1) in LSB-first order per Modbus spec.
 */
export function parseBitResponse(
  responseData: number[],
  dataLength: number,
): number[] {
  const data: number[] = [];
  for (let byteIndex = 0; byteIndex < dataLength; byteIndex++) {
    const byte = responseData[3 + byteIndex];
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      data.push((byte >> bitIndex) & 1);
    }
  }
  return data;
}

/**
 * Utility function to parse register-based responses (FC03/FC04).
 *
 * Extracts 16-bit register values from the response payload starting at the
 * standard offset. Each register is represented as a big-endian 16-bit value.
 *
 * @param responseData - Complete RTU response as a byte array.
 * @param dataLength - Number of data bytes (should be an even number).
 */
export function parseRegisterResponse(
  responseData: number[],
  dataLength: number,
): number[] {
  const data: number[] = [];
  for (let i = 0; i < dataLength; i += 2) {
    const value = (responseData[3 + i] << 8) | responseData[3 + i + 1];
    data.push(value);
  }
  return data;
}

/**
 * Parse bit data from raw bytes (modern helper).
 *
 * @param rawBytes - Byte array containing packed bits (LSB-first within each byte).
 * @param numBits - Number of bits to decode.
 */
export function parseBitData(rawBytes: number[], numBits: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < numBits; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = i % 8;
    if (byteIndex < rawBytes.length) {
      data.push((rawBytes[byteIndex] >> bitIndex) & 1);
    } else {
      data.push(0);
    }
  }
  return data;
}

/**
 * Parse register data from raw bytes (modern helper).
 *
 * Interprets consecutive pairs of bytes as big-endian 16-bit register values.
 */
export function parseRegisterData(rawBytes: number[]): number[] {
  const data: number[] = [];
  for (let i = 0; i < rawBytes.length; i += 2) {
    if (i + 1 < rawBytes.length) {
      const value = (rawBytes[i] << 8) | rawBytes[i + 1];
      data.push(value);
    }
  }
  return data;
}

/**
 * Check whether the buffer at startIndex could be the start of an RTU frame.
 *
 * Performs lightweight validation on slave id and function code ranges.
 */
export function isPlausibleFrameStart(
  buffer: number[],
  startIndex: number,
): boolean {
  if (startIndex >= buffer.length) return false;

  const slaveId = buffer[startIndex];
  const functionCode = buffer[startIndex + 1] || 0;

  // Valid slave ID range: 1-247 (0x01-0xF7)
  if (slaveId < 1 || slaveId > 247) return false;

  const isException =
    (functionCode & 0x80) !== 0 && isFunctionCode(functionCode & 0x7f);

  return isFunctionCode(functionCode) || isException;
}

/**
 * Find the next plausible RTU frame start in the buffer for resynchronization.
 *
 * Scans from index 1 to avoid returning the current (possibly corrupted)
 * start position.
 */
export function findFrameResyncPosition(buffer: number[]): number {
  for (let i = 1; i < buffer.length - 1; i++) {
    if (isPlausibleFrameStart(buffer, i)) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse an RTU frame from the provided buffer and validate CRC.
 *
 * Returns a ParseResult which contains either the parsed frame or an error
 * describing why parsing failed.
 */
export function parseRTUFrame(
  buffer: number[],
): Result<ParsedFrame, ModbusFrameError | ModbusCRCError> {
  if (buffer.length < 5) {
    return createErr(
      new ModbusFrameError("RTU frame too short (minimum 5 bytes)"),
    );
  }

  const slaveId = buffer[0];
  const functionCode = buffer[1];
  const isException = (functionCode & 0x80) !== 0;

  let expectedLength: number;
  if (isException) {
    expectedLength = 5; // slave + fc + exception + crc(2)
  } else {
    switch (functionCode) {
      case 1:
      case 2:
      case 3:
      case 4:
        if (buffer.length < 3)
          return createErr(new ModbusFrameError("Incomplete response header"));
        expectedLength = 3 + buffer[2] + 2; // slave + fc + byteCount + data + crc(2)
        break;
      case 5:
      case 6:
        expectedLength = 8; // slave + fc + addr(2) + value(2) + crc(2)
        break;
      case 15:
      case 16:
        expectedLength = 8; // slave + fc + addr(2) + qty(2) + crc(2)
        break;
      default:
        return createErr(
          new ModbusFrameError(`Unknown function code: ${functionCode}`),
        );
    }
  }

  if (buffer.length < expectedLength) {
    return createErr(
      new ModbusFrameError(
        `Incomplete frame: expected ${expectedLength} bytes, got ${buffer.length}`,
      ),
    );
  }

  if (!checkFrameCRC(buffer, expectedLength)) {
    return createErr(new ModbusCRCError());
  }

  let data: number[];
  let exceptionCode: number | undefined;

  if (isException) {
    exceptionCode = buffer[2];
    data = [];
  } else {
    switch (functionCode) {
      case 1:
      case 2:
      case 3:
      case 4:
        data = buffer.slice(3, 3 + buffer[2]);
        break;
      case 5:
      case 6:
      case 15:
      case 16:
        data = buffer.slice(2, expectedLength - 2);
        break;
      default:
        data = [];
    }
  }

  return createOk({
    data,
    exceptionCode,
    functionCode: functionCode & 0x7f,
    isException,
    slaveId,
  });
}

/**
 * Parse an ASCII frame string and validate LRC.
 *
 * The function accepts a full ASCII frame (including leading ':') and
 * returns the parsed payload or an error on invalid format / LRC mismatch.
 */
export function parseASCIIFrame(
  frameString: string,
): Result<ParsedFrame, ModbusFrameError | ModbusLRCError> {
  // Accept frames optionally terminated with CRLF ("\r\n"). The caller (ASCII stream scanner)
  // currently slices including CRLF, so we normalize here to simplify downstream parsing.
  if (frameString.endsWith("\r\n")) {
    frameString = frameString.slice(0, -2);
  }
  if (frameString.length < 3 || frameString[0] !== ":") {
    return createErr(new ModbusFrameError("Invalid ASCII frame format"));
  }
  const hexString = frameString.substring(1);
  if (hexString.length % 2 !== 0) {
    return createErr(
      new ModbusFrameError("ASCII frame contains odd number of hex characters"),
    );
  }

  const frameBytes: number[] = [];
  for (let i = 0; i < hexString.length; i += 2) {
    const hexPair = hexString.substring(i, i + 2);
    if (!/^[0-9A-Fa-f]{2}$/.test(hexPair)) {
      return createErr(
        new ModbusFrameError(`Invalid hex pair in ASCII frame: ${hexPair}`),
      );
    }
    const byte = parseInt(hexPair, 16);
    frameBytes.push(byte);
  }

  if (frameBytes.length < 3) {
    return createErr(new ModbusFrameError("ASCII frame too short"));
  }

  const receivedLRC = frameBytes[frameBytes.length - 1];
  const messageBytes = frameBytes.slice(0, -1);
  const calculatedLRC = calculateLRC(messageBytes);

  if (receivedLRC !== calculatedLRC) {
    return createErr(new ModbusLRCError());
  }

  const slaveId = messageBytes[0];
  const rawFunctionCode = messageBytes[1];
  const baseFunctionCode = rawFunctionCode & 0x7f;
  const isException = (rawFunctionCode & 0x80) !== 0;

  let data: number[];
  let exceptionCode: number | undefined;

  if (isException) {
    if (messageBytes.length < 3) {
      return createErr(new ModbusFrameError("Invalid exception frame length"));
    }
    exceptionCode = messageBytes[2];
    data = [];
  } else {
    if (
      messageBytes.length >= 3 &&
      baseFunctionCode >= 1 &&
      baseFunctionCode <= 4
    ) {
      const byteCount = messageBytes[2];
      data = messageBytes.slice(3, 3 + byteCount); // only the data bytes (no byteCount)
    } else {
      data = messageBytes.slice(2);
    }
  }

  return createOk({
    data,
    exceptionCode,
    // For consistency with existing tests, expose base function code (mask exception bit)
    functionCode: baseFunctionCode,
    isException,
    slaveId,
  });
}

export function checkFrameCRC(
  buffer: number[],
  responseLength: number,
): boolean {
  const messageWithoutCRC = buffer.slice(0, responseLength - 2);
  const receivedCRC =
    (buffer[responseLength - 1] << 8) | buffer[responseLength - 2];

  return receivedCRC === calculateCRC16(messageWithoutCRC);
}

/**
 * Helper function to validate RTU frame.
 */
export function validateRTUFrame(
  frame: number[],
): Result<void, ModbusFrameError | ModbusCRCError> {
  if (frame.length < 5) {
    return createErr(new ModbusFrameError("RTU frame too short"));
  }

  const expectedLength = getExpectedResponseLength(frame);
  if (expectedLength === -1) {
    return createErr(new ModbusFrameError("Invalid function code"));
  }

  if (frame.length < expectedLength) {
    return createErr(new ModbusFrameError("Incomplete frame"));
  }

  if (!checkFrameCRC(frame, expectedLength)) {
    return createErr(new ModbusCRCError());
  }

  return createOk(undefined);
}

/**
 * Helper function to validate ASCII frame and return parsed number array.
 */
export function validateASCIIFrame(
  frameString: string,
): Result<number[], ModbusFrameError | ModbusLRCError> {
  const result = parseASCIIFrame(frameString);
  if (isErr(result)) return result;

  // Reconstruct the minimal raw frame bytes expected by ASCII request waiter.
  // Important: preserve exception bit (0x80) so higher-level logic can detect
  // Modbus exception responses. For exception frames include the exception
  // code byte (which parseASCIIFrame keeps separate from data array).
  const data = unwrapOk(result);
  const rawFunctionCode = data.isException
    ? data.functionCode | 0x80
    : data.functionCode;
  const exceptionCode = data.exceptionCode ?? 0;
  const frame: number[] = data.isException
    ? [data.slaveId, rawFunctionCode, exceptionCode]
    : [data.slaveId, rawFunctionCode, ...data.data];

  return createOk(frame);
}

/**
 * Helper function to get expected response length for RTU frames.
 */
export function getExpectedResponseLength(buffer: number[]): number {
  if (buffer.length < 2) return -1;

  const functionCode = buffer[1];
  const isException = (functionCode & 0x80) !== 0;

  if (isException) {
    return 5; // slave + fc + exception + crc(2)
  }

  switch (functionCode) {
    case 1:
    case 2:
    case 3:
    case 4:
      if (buffer.length < 3) return -1;
      return 3 + buffer[2] + 2; // slave + fc + byteCount + data + crc(2)
    case 5:
    case 6:
      return 8; // slave + fc + addr(2) + value(2) + crc(2)
    case 15:
    case 16:
      return 8; // slave + fc + addr(2) + qty(2) + crc(2)
    default:
      return -1; // Unknown function code
  }
}
