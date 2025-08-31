// Function code metadata and utilities for Modbus operations

// Function code metadata mapping for easy extension and UI labeling
export const FUNCTION_CODE_LABELS: Record<FunctionCode, string> = {
  1: 'Coils',
  2: 'Discrete Inputs',
  3: 'Holding Registers',
  4: 'Input Registers',
  5: 'Single Coil Write',
  6: 'Single Register Write',
  15: 'Multiple Coils Write',
  16: 'Multiple Registers Write',
} as const

// Valid function codes supported by this implementation
export const VALID_FUNCTION_CODES = [1, 2, 3, 4, 5, 6, 15, 16] as const
export type FunctionCode = (typeof VALID_FUNCTION_CODES)[number]

export type ReadFunctionCode = 1 | 2 | 3 | 4
export type WriteSingleFunctionCode = 5 | 6
export type WriteMultiFunctionCode = 15 | 16
export type WriteFunctionCode = WriteSingleFunctionCode | WriteMultiFunctionCode

// Check if a function code is valid
export function isValidFunctionCode(code: number): code is FunctionCode {
  return VALID_FUNCTION_CODES.includes(code as FunctionCode)
}

// Check if a function code is a read operation
export function isReadFunctionCode(code: number): code is ReadFunctionCode {
  return code === 1 || code === 2 || code === 3 || code === 4
}

export function isWriteFunctionCode(code: number): code is WriteFunctionCode {
  return code === 5 || code === 6 || code === 15 || code === 16
}

// Check if a function code returns bit-based data (FC01/FC02)
export function isBitBasedFunctionCode(code: number): code is 1 | 2 {
  return isValidFunctionCode(code) && (code === 1 || code === 2)
}

// Check if a function code returns register-based data (FC03/FC04)
export function isRegisterBasedFunctionCode(code: number): code is 3 | 4 {
  return isValidFunctionCode(code) && (code === 3 || code === 4)
}
