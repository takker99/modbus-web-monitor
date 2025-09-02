/**
 * Function code metadata and utilities for Modbus operations.
 *
 * This module centralizes the supported function codes, their labels,
 * and small predicate helpers used throughout the codebase and tests.
 */

/** Tuple of valid function codes supported by this implementation. */
export const FUNCTION_CODES = [1, 2, 3, 4, 5, 6, 15, 16] as const;

/** Numeric union of supported function codes. */
export type FunctionCode = (typeof FUNCTION_CODES)[number];

/** Read-only function codes (FC01-FC04). */
export type ReadFunctionCode = 1 | 2 | 3 | 4;
/** Single-write function codes (FC05-FC06). */
export type WriteSingleFunctionCode = 5 | 6;
/** Multi-write function codes (FC15-FC16). */
export type WriteMultiFunctionCode = 15 | 16;
/** Combined write function codes. */
export type WriteFunctionCode =
  | WriteSingleFunctionCode
  | WriteMultiFunctionCode;

/**
 * Return true when the provided code is one of the supported function codes.
 *
 * @param code - Numeric function code
 */
export function isFunctionCode(code: number): code is FunctionCode {
  return FUNCTION_CODES.includes(code as FunctionCode);
}

/**
 * True when the code represents a read operation (coils/inputs/registers).
 *
 * @param code - Numeric function code
 */
export function isReadFunctionCode(code: number): code is ReadFunctionCode {
  return code === 1 || code === 2 || code === 3 || code === 4;
}

/**
 * True when the code represents a write operation.
 *
 * @param code - Numeric function code
 */
export function isWriteFunctionCode(code: number): code is WriteFunctionCode {
  return code === 5 || code === 6 || code === 15 || code === 16;
}

/**
 * True when the response data for the function code is bit-packed (FC01/FC02).
 *
 * @param code - Numeric function code
 */
export function isBitBasedFunctionCode(code: number): code is 1 | 2 {
  return code === 1 || code === 2;
}

/**
 * True when the response data for the function code is register-based (FC03/FC04).
 *
 * @param code - Numeric function code
 */
export function isRegisterBasedFunctionCode(code: number): code is 3 | 4 {
  return code === 3 || code === 4
}
