// Pure functions for parsing Modbus frames and responses

import { calculateCRC16 } from "./crc.ts";
import { ModbusCRCError, ModbusFrameError, ModbusLRCError } from "./errors.ts";
import { isValidFunctionCode } from "./functionCodes.ts";
import { calculateLRC } from "./lrc.ts";

// Result type for frame parsing operations
export type ParseResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: Error;
    };

// Parsed frame data
export interface ParsedFrame {
  slaveId: number;
  functionCode: number;
  data: number[];
  isException: boolean;
  exceptionCode?: number;
}

// Utility function to parse bit-based responses (FC01/FC02) - backwards compatibility
export function parseBitResponse(
  responseData: number[],
  dataLength: number,
): number[] {
  const data: number[] = [];
  // dataLength is the number of bytes containing bit data
  for (let byteIndex = 0; byteIndex < dataLength; byteIndex++) {
    const byte = responseData[3 + byteIndex]; // Skip slave, fc, byteCount
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      data.push((byte >> bitIndex) & 1);
    }
  }
  return data;
}

// Utility function to parse register-based responses (FC03/FC04) - backwards compatibility
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

// Modern implementations for new frame parser (pure functions)
// Parse bit data from raw bytes
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

// Parse register data from raw bytes
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

// Check if a byte sequence looks like a valid Modbus RTU frame start
export function isPlausibleFrameStart(
  buffer: number[],
  startIndex: number,
): boolean {
  if (startIndex >= buffer.length) return false;

  const slaveId = buffer[startIndex];
  const functionCode = buffer[startIndex + 1] || 0;

  // Valid slave ID range: 1-247 (0x01-0xF7)
  if (slaveId < 1 || slaveId > 247) return false;

  // Valid function codes: 1-6, 15-16, or exception responses (0x81-0x86, 0x8F, 0x90)
  const isException =
    (functionCode & 0x80) !== 0 && isValidFunctionCode(functionCode & 0x7f);

  return isValidFunctionCode(functionCode) || isException;
}

// Find the next plausible frame start position in buffer for resynchronization
export function findFrameResyncPosition(buffer: number[]): number {
  // Start scanning from position 1 (skip current corrupted frame start)
  for (let i = 1; i < buffer.length - 1; i++) {
    if (isPlausibleFrameStart(buffer, i)) {
      return i;
    }
  }
  return -1; // No candidate found
}

// Parse RTU frame and validate CRC
export function parseRTUFrame(buffer: number[]): ParseResult<ParsedFrame> {
  if (buffer.length < 5) {
    return {
      error: new ModbusFrameError("RTU frame too short (minimum 5 bytes)"),
      success: false,
    };
  }

  const slaveId = buffer[0];
  const functionCode = buffer[1];
  const isException = (functionCode & 0x80) !== 0;

  // Determine expected frame length
  let expectedLength: number;
  if (isException) {
    expectedLength = 5; // slave + fc + exception + crc(2)
  } else {
    // Calculate based on function code and data
    switch (functionCode) {
      case 1:
      case 2:
      case 3:
      case 4:
        if (buffer.length < 3)
          return {
            error: new ModbusFrameError("Incomplete response header"),
            success: false,
          };
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
        return {
          error: new ModbusFrameError(`Unknown function code: ${functionCode}`),
          success: false,
        };
    }
  }

  if (buffer.length < expectedLength) {
    return {
      error: new ModbusFrameError(
        `Incomplete frame: expected ${expectedLength} bytes, got ${buffer.length}`,
      ),
      success: false,
    };
  }

  // Validate CRC
  // checkFrameCRC returns true when CRC matches, so invert for error condition
  if (!checkFrameCRC(buffer, expectedLength)) {
    return { error: new ModbusCRCError(), success: false };
  }

  // Extract data
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

  return {
    data: {
      data,
      exceptionCode,
      functionCode: functionCode & 0x7f, // Remove exception bit for consistency
      isException,
      slaveId,
    },
    success: true,
  };
}

// Parse ASCII frame and validate LRC
export function parseASCIIFrame(frameString: string): ParseResult<ParsedFrame> {
  // Frame should start with ':' and contain hex pairs
  if (frameString.length < 3 || frameString[0] !== ":") {
    return {
      error: new ModbusFrameError("Invalid ASCII frame format"),
      success: false,
    };
  }

  // Remove the ':' and parse hex pairs
  const hexString = frameString.substring(1);
  if (hexString.length % 2 !== 0) {
    return {
      error: new ModbusFrameError(
        "ASCII frame contains odd number of hex characters",
      ),
      success: false,
    };
  }

  // Convert hex pairs to bytes
  const frameBytes: number[] = [];
  for (let i = 0; i < hexString.length; i += 2) {
    const hexPair = hexString.substring(i, i + 2);

    // Validate that both characters are valid hex digits
    if (!/^[0-9A-Fa-f]{2}$/.test(hexPair)) {
      return {
        error: new ModbusFrameError(
          `Invalid hex pair in ASCII frame: ${hexPair}`,
        ),
        success: false,
      };
    }

    const byte = parseInt(hexPair, 16);
    frameBytes.push(byte);
  }

  // Need at least slave + function + LRC = 3 bytes
  if (frameBytes.length < 3) {
    return {
      error: new ModbusFrameError("ASCII frame too short"),
      success: false,
    };
  }

  // Extract LRC (last byte) and message (all but last byte)
  const receivedLRC = frameBytes[frameBytes.length - 1];
  const messageBytes = frameBytes.slice(0, -1);
  const calculatedLRC = calculateLRC(messageBytes);

  if (receivedLRC !== calculatedLRC) {
    return { error: new ModbusLRCError(), success: false };
  }

  const slaveId = messageBytes[0];
  const functionCode = messageBytes[1];
  const isException = (functionCode & 0x80) !== 0;

  let data: number[];
  let exceptionCode: number | undefined;

  if (isException) {
    if (messageBytes.length < 3) {
      return {
        error: new ModbusFrameError("Invalid exception frame length"),
        success: false,
      };
    }
    exceptionCode = messageBytes[2];
    data = [];
  } else {
    // Align extraction semantics with parseRTUFrame: omit byteCount for FC 1-4
    if (
      messageBytes.length >= 3 &&
      (functionCode & 0x7f) >= 1 &&
      (functionCode & 0x7f) <= 4
    ) {
      const byteCount = messageBytes[2];
      data = messageBytes.slice(3, 3 + byteCount);
    } else {
      data = messageBytes.slice(2);
    }
  }

  return {
    data: {
      data,
      exceptionCode,
      functionCode: functionCode & 0x7f, // Remove exception bit for consistency
      isException,
      slaveId,
    },
    success: true,
  };
}

export function checkFrameCRC(
  buffer: number[],
  responseLength: number,
): boolean {
  // CRC check
  const messageWithoutCRC = buffer.slice(0, responseLength - 2);
  const receivedCRC =
    (buffer[responseLength - 1] << 8) | buffer[responseLength - 2];

  return receivedCRC === calculateCRC16(messageWithoutCRC);
}

// Helper function to validate RTU frame
export function validateRTUFrame(frame: number[]): { isValid: boolean; error?: Error } {
  if (frame.length < 5) {
    return { isValid: false, error: new ModbusFrameError("RTU frame too short") };
  }

  const expectedLength = getExpectedResponseLength(frame);
  if (expectedLength === -1) {
    return { isValid: false, error: new ModbusFrameError("Invalid function code") };
  }

  if (frame.length < expectedLength) {
    return { isValid: false, error: new ModbusFrameError("Incomplete frame") };
  }

  if (!checkFrameCRC(frame, expectedLength)) {
    return { isValid: false, error: new ModbusCRCError() };
  }

  return { isValid: true };
}

// Helper function to validate ASCII frame  
export function validateASCIIFrame(frameString: string): { isValid: boolean; frame?: number[]; error?: Error } {
  const result = parseASCIIFrame(frameString);
  if (!result.success) {
    return { isValid: false, error: result.error };
  }

  // Convert parsed frame back to number array for compatibility
  const frame: number[] = [
    result.data.slaveId,
    result.data.functionCode,
    ...result.data.data
  ];

  return { isValid: true, frame };
}

// Helper function to get expected response length for RTU frames
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
