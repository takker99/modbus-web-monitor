import { describe, expect, it } from 'vitest'

// These are the parsing functions extracted from App.tsx for testing
// Helper functions for multi-write operations
const parseCoilValues = (input: string): number[] => {
  // Parse comma-separated or space-separated bits (0/1)
  const values = input
    .split(/[,\s]+/)
    .map(v => v.trim())
    .filter(v => v !== '')
    .map(v => {
      const num = Number.parseInt(v, 10)
      if (num !== 0 && num !== 1) {
        throw new Error(`Invalid coil value: ${v}. Must be 0 or 1.`)
      }
      return num
    })
  
  if (values.length === 0) {
    throw new Error('No coil values provided')
  }
  if (values.length > 1968) {
    throw new Error(`Too many coils: ${values.length}. Maximum is 1968.`)
  }
  
  return values
}

const parseRegisterValues = (input: string, hexDisplay: boolean = false): number[] => {
  // Parse comma-separated, newline-separated, or space-separated register values
  const values = input
    .split(/[,\n\s]+/)
    .map(v => v.trim())
    .filter(v => v !== '')
    .map(v => {
      let num: number
      if (hexDisplay && v.startsWith('0x')) {
        num = Number.parseInt(v, 16)
      } else if (hexDisplay) {
        num = Number.parseInt(v, 16)
      } else {
        num = Number.parseInt(v, 10)
      }
      
      if (Number.isNaN(num) || num < 0 || num > 65535) {
        throw new Error(`Invalid register value: ${v}. Must be 0-65535.`)
      }
      return num
    })
  
  if (values.length === 0) {
    throw new Error('No register values provided')
  }
  if (values.length > 123) {
    throw new Error(`Too many registers: ${values.length}. Maximum is 123.`)
  }
  
  return values
}

describe('UI Multi-write Parsing Functions', () => {
  describe('parseCoilValues', () => {
    it('parses comma-separated coil values', () => {
      const result = parseCoilValues('1,0,1,1,0')
      expect(result).toEqual([1, 0, 1, 1, 0])
    })

    it('parses space-separated coil values', () => {
      const result = parseCoilValues('1 0 1 1 0')
      expect(result).toEqual([1, 0, 1, 1, 0])
    })

    it('parses mixed separators', () => {
      const result = parseCoilValues('1, 0 1,1 0')
      expect(result).toEqual([1, 0, 1, 1, 0])
    })

    it('handles extra whitespace', () => {
      const result = parseCoilValues(' 1 , 0 , 1 ')
      expect(result).toEqual([1, 0, 1])
    })

    it('throws error for invalid coil values', () => {
      expect(() => parseCoilValues('1,2,0')).toThrow('Invalid coil value: 2. Must be 0 or 1.')
      expect(() => parseCoilValues('1,-1,0')).toThrow('Invalid coil value: -1. Must be 0 or 1.')
    })

    it('throws error for empty input', () => {
      expect(() => parseCoilValues('')).toThrow('No coil values provided')
      expect(() => parseCoilValues('   ')).toThrow('No coil values provided')
    })

    it('throws error for too many coils', () => {
      const tooManyCoils = new Array(1969).fill('1').join(',')
      expect(() => parseCoilValues(tooManyCoils)).toThrow('Too many coils: 1969. Maximum is 1968.')
    })

    it('accepts maximum allowed coils', () => {
      const maxCoils = new Array(1968).fill('1').join(',')
      const result = parseCoilValues(maxCoils)
      expect(result.length).toBe(1968)
      expect(result.every(v => v === 1)).toBe(true)
    })
  })

  describe('parseRegisterValues', () => {
    it('parses comma-separated register values in decimal', () => {
      const result = parseRegisterValues('1234,5678,9999')
      expect(result).toEqual([1234, 5678, 9999])
    })

    it('parses space-separated register values', () => {
      const result = parseRegisterValues('1234 5678 9999')
      expect(result).toEqual([1234, 5678, 9999])
    })

    it('parses newline-separated register values', () => {
      const result = parseRegisterValues('1234\n5678\n9999')
      expect(result).toEqual([1234, 5678, 9999])
    })

    it('parses hex values with 0x prefix when hexDisplay is true', () => {
      const result = parseRegisterValues('0x1234,0x5678,0x9ABC', true)
      expect(result).toEqual([0x1234, 0x5678, 0x9ABC])
    })

    it('parses hex values without 0x prefix when hexDisplay is true', () => {
      const result = parseRegisterValues('1234,5678,9ABC', true)
      expect(result).toEqual([0x1234, 0x5678, 0x9ABC])
    })

    it('handles mixed separators', () => {
      const result = parseRegisterValues('1234, 5678\n9999 1111')
      expect(result).toEqual([1234, 5678, 9999, 1111])
    })

    it('throws error for invalid register values', () => {
      expect(() => parseRegisterValues('1234,abc,5678')).toThrow('Invalid register value: abc. Must be 0-65535.')
      expect(() => parseRegisterValues('1234,-1,5678')).toThrow('Invalid register value: -1. Must be 0-65535.')
      expect(() => parseRegisterValues('1234,65536,5678')).toThrow('Invalid register value: 65536. Must be 0-65535.')
    })

    it('throws error for empty input', () => {
      expect(() => parseRegisterValues('')).toThrow('No register values provided')
      expect(() => parseRegisterValues('   \n  ')).toThrow('No register values provided')
    })

    it('throws error for too many registers', () => {
      const tooManyRegisters = new Array(124).fill('1234').join(',')
      expect(() => parseRegisterValues(tooManyRegisters)).toThrow('Too many registers: 124. Maximum is 123.')
    })

    it('accepts maximum allowed registers', () => {
      const maxRegisters = new Array(123).fill('1234').join(',')
      const result = parseRegisterValues(maxRegisters)
      expect(result.length).toBe(123)
      expect(result.every(v => v === 1234)).toBe(true)
    })

    it('accepts boundary values', () => {
      const result = parseRegisterValues('0,65535')
      expect(result).toEqual([0, 65535])
    })
  })
})