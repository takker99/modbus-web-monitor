import { describe, expect, it } from 'vitest'
import {
  FUNCTION_CODE_LABELS,
  isBitBasedFunctionCode,
  isReadFunctionCode,
  isRegisterBasedFunctionCode,
  isValidFunctionCode,
  isWriteFunctionCode,
  VALID_FUNCTION_CODES,
} from '../src/functionCodes.ts'

describe('Function Code Utilities', () => {
  describe('Constants', () => {
    it('has correct function code labels', () => {
      expect(FUNCTION_CODE_LABELS[1]).toBe('Coils')
      expect(FUNCTION_CODE_LABELS[3]).toBe('Holding Registers')
      expect(FUNCTION_CODE_LABELS[15]).toBe('Multiple Coils Write')
    })

    it('includes all supported function codes', () => {
      expect(VALID_FUNCTION_CODES).toEqual([1, 2, 3, 4, 5, 6, 15, 16])
    })
  })

  describe('isValidFunctionCode', () => {
    it('returns true for valid function codes', () => {
      for (const code of VALID_FUNCTION_CODES) {
        expect(isValidFunctionCode(code)).toBe(true)
      }
    })

    it('returns false for invalid function codes', () => {
      expect(isValidFunctionCode(0)).toBe(false)
      expect(isValidFunctionCode(7)).toBe(false)
      expect(isValidFunctionCode(255)).toBe(false)
    })
  })

  describe('isReadFunctionCode', () => {
    it('returns true for read function codes', () => {
      expect(isReadFunctionCode(1)).toBe(true)
      expect(isReadFunctionCode(2)).toBe(true)
      expect(isReadFunctionCode(3)).toBe(true)
      expect(isReadFunctionCode(4)).toBe(true)
    })

    it('returns false for write function codes', () => {
      expect(isReadFunctionCode(5)).toBe(false)
      expect(isReadFunctionCode(6)).toBe(false)
      expect(isReadFunctionCode(15)).toBe(false)
      expect(isReadFunctionCode(16)).toBe(false)
    })
  })

  describe('isWriteFunctionCode', () => {
    it('returns true for write function codes', () => {
      expect(isWriteFunctionCode(5)).toBe(true)
      expect(isWriteFunctionCode(6)).toBe(true)
      expect(isWriteFunctionCode(15)).toBe(true)
      expect(isWriteFunctionCode(16)).toBe(true)
    })

    it('returns false for read function codes', () => {
      expect(isWriteFunctionCode(1)).toBe(false)
      expect(isWriteFunctionCode(2)).toBe(false)
      expect(isWriteFunctionCode(3)).toBe(false)
      expect(isWriteFunctionCode(4)).toBe(false)
    })
  })

  describe('isBitBasedFunctionCode', () => {
    it('returns true for bit-based function codes', () => {
      expect(isBitBasedFunctionCode(1)).toBe(true) // Coils
      expect(isBitBasedFunctionCode(2)).toBe(true) // Discrete Inputs
    })

    it('returns false for register-based function codes', () => {
      expect(isBitBasedFunctionCode(3)).toBe(false) // Holding Registers
      expect(isBitBasedFunctionCode(4)).toBe(false) // Input Registers
    })
  })

  describe('isRegisterBasedFunctionCode', () => {
    it('returns true for register-based function codes', () => {
      expect(isRegisterBasedFunctionCode(3)).toBe(true) // Holding Registers
      expect(isRegisterBasedFunctionCode(4)).toBe(true) // Input Registers
    })

    it('returns false for bit-based function codes', () => {
      expect(isRegisterBasedFunctionCode(1)).toBe(false) // Coils
      expect(isRegisterBasedFunctionCode(2)).toBe(false) // Discrete Inputs
    })
  })
})
