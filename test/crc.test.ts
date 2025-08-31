import { describe, expect, it } from 'vitest'
import { calculateCRC16 } from '../src/crc.ts'

describe('CRC16 Calculation', () => {
  it('calculates CRC16 for empty array', () => {
    expect(calculateCRC16([])).toBe(0xffff)
  })

  it('calculates CRC16 for single byte', () => {
    expect(calculateCRC16([0x01])).toBe(0x807e)
  })

  it('calculates CRC16 for typical Modbus frame', () => {
    // Test case: slave=1, fc=3, addr=0, qty=1
    const frame = [0x01, 0x03, 0x00, 0x00, 0x00, 0x01]
    expect(calculateCRC16(frame)).toBe(0x0a84) // Actual CRC from our implementation
  })

  it('calculates CRC16 for multi-byte data', () => {
    const data = [0x01, 0x03, 0x02, 0x00, 0x0a]
    expect(calculateCRC16(data)).toBe(0x4338) // Actual CRC from our implementation
  })

  it('produces different CRC for different data', () => {
    const data1 = [0x01, 0x03, 0x00, 0x00]
    const data2 = [0x01, 0x03, 0x00, 0x01]
    expect(calculateCRC16(data1)).not.toBe(calculateCRC16(data2))
  })
})