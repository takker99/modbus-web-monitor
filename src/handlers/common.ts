// Common utilities for Modbus handlers
// Shared functionality for request/response handling

import type { IModbusTransport } from "../transport/transport.ts";
import type { Result } from "../types/result.ts";
import { err, ok } from "../types/result.ts";
import { ModbusExceptionError } from "../errors.ts";
import { 
  getExpectedResponseLength, 
  validateRTUFrame, 
  validateASCIIFrame 
} from "../frameParser.ts";

/**
 * Enhanced error context for better error handling
 */
export interface ErrorContext {
  timestamp: Date;
  unitId: number;
  functionCode: number;
  address?: number;
  protocol: "rtu" | "ascii";
  timeout: number;
  phase: "send" | "receive" | "parse" | "validate";
  details?: string;
}

/**
 * Enhanced error class with context information
 */
export class ModbusContextError extends Error {
  constructor(
    message: string,
    public readonly context: ErrorContext,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "ModbusContextError";
  }
}

/**
 * Send request and wait for response with advanced error handling
 * 
 * @param transport - Modbus transport instance
 * @param requestFrame - Frame data to send
 * @param expectedUnitId - Expected unit ID in response
 * @param expectedFunctionCode - Expected function code in response
 * @param protocol - Protocol type (RTU or ASCII)
 * @param timeout - Request timeout in milliseconds
 * @returns Promise<Result<Uint8Array, Error>>
 */
export async function sendRequestAndWaitForResponse(
  transport: IModbusTransport,
  requestFrame: Uint8Array,
  expectedUnitId: number,
  expectedFunctionCode: number,
  protocol: "rtu" | "ascii",
  timeout: number,
): Promise<Result<Uint8Array, Error>> {
  const baseContext: Omit<ErrorContext, "phase"> = {
    timestamp: new Date(),
    unitId: expectedUnitId,
    functionCode: expectedFunctionCode,
    protocol,
    timeout,
  };

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      const context: ErrorContext = { ...baseContext, phase: "receive" };
      resolve(err(new ModbusContextError("Request timeout", context)));
    }, timeout);

    let buffer: number[] = [];
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
      const context: ErrorContext = { ...baseContext, phase: "receive" };
      resolve(err(new ModbusContextError("Transport error", context, error)));
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
        const isMatch = unitId === expectedUnitId && 
          (functionCode === expectedFunctionCode || 
           (functionCode & 0x80 && (functionCode & 0x7f) === expectedFunctionCode));

        if (!isMatch) {
          buffer.shift(); // Remove first byte and try again
          continue;
        }

        // Check for exception response
        if (functionCode & 0x80) {
          if (buffer.length >= 5) {
            const errorCode = buffer[2];
            cleanup();
            const context: ErrorContext = { ...baseContext, phase: "parse" };
            resolve(err(new ModbusContextError(
              `Modbus exception: ${errorCode}`, 
              context, 
              new ModbusExceptionError(errorCode)
            )));
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
          const isMatch = unitId === expectedUnitId && 
            (functionCode === expectedFunctionCode || 
             (functionCode & 0x80 && (functionCode & 0x7f) === expectedFunctionCode));

          if (isMatch) {
            // Check for exception response
            if (functionCode & 0x80) {
              const errorCode = validation.frame[2];
              cleanup();
              const context: ErrorContext = { ...baseContext, phase: "parse" };
              resolve(err(new ModbusContextError(
                `Modbus exception: ${errorCode}`, 
                context, 
                new ModbusExceptionError(errorCode)
              )));
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
      const context: ErrorContext = { ...baseContext, phase: "send" };
      resolve(err(new ModbusContextError("Failed to send request", context, error)));
    });
  });
}

/**
 * Retry strategy for failed requests
 */
export interface RetryOptions {
  maxRetries: number;
  baseDelay: number; // Base delay in milliseconds
  exponentialBackoff: boolean;
  retryableErrors?: string[]; // Error names that should trigger retry
}

/**
 * Execute a request with retry logic
 */
export async function executeWithRetry<T>(
  operation: () => Promise<Result<T, Error>>,
  options: RetryOptions,
): Promise<Result<T, Error>> {
  const { maxRetries, baseDelay, exponentialBackoff, retryableErrors } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await operation();
    
    if (result.success) {
      return result;
    }
    
    // Check if error is retryable
    if (retryableErrors && !retryableErrors.includes(result.error.name)) {
      return result; // Don't retry non-retryable errors
    }
    
    // If this was the last attempt, return the error
    if (attempt === maxRetries) {
      return result;
    }
    
    // Calculate delay for next attempt
    const delay = exponentialBackoff 
      ? baseDelay * Math.pow(2, attempt)
      : baseDelay;
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // This should never be reached, but TypeScript requires it
  return err(new Error("Unexpected retry loop exit"));
}