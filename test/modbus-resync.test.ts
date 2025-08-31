import { describe, expect, it } from 'vitest'
import { calculateCRC16 } from '../src/crc.ts'
import {
  findFrameResyncPosition,
  isPlausibleFrameStart,
} from '../src/frameParser.ts'
import { ModbusClient } from '../src/modbus.ts'

describe('Buffer Resynchronization', () => {
  describe('isPlausibleFrameStart', () => {
    it('recognizes valid slave IDs (1-247)', () => {
      expect(isPlausibleFrameStart([1, 3], 0)).toBe(true)
      expect(isPlausibleFrameStart([247, 3], 0)).toBe(true)
      expect(isPlausibleFrameStart([0, 3], 0)).toBe(false) // Invalid slave ID
      expect(isPlausibleFrameStart([248, 3], 0)).toBe(false) // Invalid slave ID
    })

    it('recognizes valid function codes', () => {
      expect(isPlausibleFrameStart([1, 1], 0)).toBe(true) // FC01
      expect(isPlausibleFrameStart([1, 2], 0)).toBe(true) // FC02
      expect(isPlausibleFrameStart([1, 3], 0)).toBe(true) // FC03
      expect(isPlausibleFrameStart([1, 4], 0)).toBe(true) // FC04
      expect(isPlausibleFrameStart([1, 5], 0)).toBe(true) // FC05
      expect(isPlausibleFrameStart([1, 6], 0)).toBe(true) // FC06
      expect(isPlausibleFrameStart([1, 15], 0)).toBe(true) // FC15
      expect(isPlausibleFrameStart([1, 16], 0)).toBe(true) // FC16
      expect(isPlausibleFrameStart([1, 7], 0)).toBe(false) // Invalid function code
    })

    it('recognizes valid exception frames', () => {
      expect(isPlausibleFrameStart([1, 0x81], 0)).toBe(true) // Exception FC01
      expect(isPlausibleFrameStart([1, 0x83], 0)).toBe(true) // Exception FC03
      expect(isPlausibleFrameStart([1, 0x86], 0)).toBe(true) // Exception FC06
      expect(isPlausibleFrameStart([1, 0x8f], 0)).toBe(true) // Exception FC15
      expect(isPlausibleFrameStart([1, 0x90], 0)).toBe(true) // Exception FC16
      expect(isPlausibleFrameStart([1, 0x87], 0)).toBe(false) // Invalid exception
    })

    it('handles buffer boundary conditions', () => {
      expect(isPlausibleFrameStart([1], 0)).toBe(false) // Missing function code
      expect(isPlausibleFrameStart([1, 3], 1)).toBe(false) // Index out of bounds
      expect(isPlausibleFrameStart([], 0)).toBe(false) // Empty buffer
    })
  })

  describe('findFrameResyncPosition', () => {
    it('finds valid frame start after corrupted data', () => {
      const buffer = [
        0xff,
        0xff,
        0x00, // Noise/corruption
        0x01,
        0x03,
        0x02,
        0x00,
        0x0a, // Valid frame start
      ]
      expect(findFrameResyncPosition(buffer)).toBe(3)
    })

    it('returns -1 when no valid frame start found', () => {
      const buffer = [0xff, 0xff, 0x00, 0x00, 0xff]
      expect(findFrameResyncPosition(buffer)).toBe(-1)
    })

    it('skips first position (current corrupted frame)', () => {
      const buffer = [
        0x01,
        0x03, // Valid but should be skipped (position 0)
        0xff,
        0xff, // Noise
        0x02,
        0x04, // Valid frame start at position 4
      ]
      expect(findFrameResyncPosition(buffer)).toBe(4)
    })

    it('finds exception frame starts', () => {
      const buffer = [
        0xff,
        0x00, // Noise
        0x01,
        0x83, // Exception frame start
        0x02, // Error code
      ]
      expect(findFrameResyncPosition(buffer)).toBe(2)
    })

    it('handles empty and small buffers', () => {
      expect(findFrameResyncPosition([])).toBe(-1)
      expect(findFrameResyncPosition([1])).toBe(-1)
      expect(findFrameResyncPosition([1, 3])).toBe(-1) // Too small to scan
    })
  })

  describe('CRC Error Recovery', () => {
    it('recovers valid frame after CRC error with noise', async () => {
      const client = new ModbusClient()

      // First request that will fail due to CRC error
      const promise1 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Create corrupted frame followed by valid frame
      const corruptedFrame = [1, 3, 2, 0, 5]
      const corruptedCrc = calculateCRC16(corruptedFrame)
      corruptedFrame.push(
        corruptedCrc & 0xff,
        ((corruptedCrc >> 8) & 0xff) ^ 0xff
      ) // Corrupt CRC

      const validFrame = [1, 3, 2, 0, 10]
      const validCrc = calculateCRC16(validFrame)
      validFrame.push(validCrc & 0xff, (validCrc >> 8) & 0xff)

      // Send noise, corrupted frame, more noise, then valid frame
      const noisyBuffer = [
        0xff,
        0xff,
        0x00, // Noise before
        ...corruptedFrame,
        0xaa,
        0xbb, // Noise between frames
        ...validFrame,
      ]

      client.handleResponse(new Uint8Array(noisyBuffer))

      // First request should fail with CRC error
      await expect(promise1).rejects.toThrow(/CRC error/)

      // Second request should succeed by finding the valid frame in buffer
      const promise2 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      const result = await promise2
      expect(result.data).toEqual([10])
    })

    it('handles multiple corrupted frames before finding valid one', async () => {
      const client = new ModbusClient()

      const promise1 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Create multiple corrupted attempts followed by valid frame
      const validFrame = [1, 3, 2, 0, 42]
      const validCrc = calculateCRC16(validFrame)
      validFrame.push(validCrc & 0xff, (validCrc >> 8) & 0xff)

      const multiCorruptedBuffer = [
        0xff,
        0x00,
        0x11,
        0x22, // Initial noise
        1,
        3,
        2,
        0,
        5,
        0xff,
        0xff, // First corrupted frame (bad CRC)
        0xaa,
        0xbb, // More noise
        2,
        4,
        1,
        99,
        0xcc,
        0xdd, // Wrong slave ID frame
        0x33,
        0x44, // More noise
        ...validFrame, // Finally, a valid frame
      ]

      client.handleResponse(new Uint8Array(multiCorruptedBuffer))

      await expect(promise1).rejects.toThrow(/CRC error/)

      // Should resync to the valid frame
      const promise2 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      const result = await promise2
      expect(result.data).toEqual([42])
    })

    it('falls back to full buffer clear when no valid frame found', async () => {
      const client = new ModbusClient()

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Only noise and invalid data - no valid frame to resync to
      const noisyBuffer = [
        1,
        3,
        2,
        0,
        5,
        0xff,
        0xff, // Corrupted frame (bad CRC)
        0xff,
        0xff,
        0x00,
        0x00,
        0xaa,
        0xbb, // Only noise afterward
      ]

      client.handleResponse(new Uint8Array(noisyBuffer))

      await expect(promise).rejects.toThrow(/CRC error/)

      // Buffer should be cleared completely
      // Send a new valid frame - it should work immediately
      const promise2 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      const validFrame = [1, 3, 2, 0, 99]
      const validCrc = calculateCRC16(validFrame)
      validFrame.push(validCrc & 0xff, (validCrc >> 8) & 0xff)

      client.handleResponse(new Uint8Array(validFrame))

      const result = await promise2
      expect(result.data).toEqual([99])
    })

    it('preserves normal behavior for non-CRC errors', async () => {
      const client = new ModbusClient()

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Send an exception frame (non-CRC error)
      const exceptionFrame = [1, 0x83, 2] // Illegal data address
      const crc = calculateCRC16(exceptionFrame)
      exceptionFrame.push(crc & 0xff, (crc >> 8) & 0xff)

      client.handleResponse(new Uint8Array(exceptionFrame))

      await expect(promise).rejects.toThrow(/Illegal data address/)
    })
  })

  describe('Performance and Edge Cases', () => {
    it('handles large buffers efficiently', () => {
      // Create a large buffer with valid frame at the end
      const largeBuffer = new Array(1000).fill(0xff) // 1000 bytes of noise
      largeBuffer.push(1, 3, 2, 0, 50) // Valid frame at end

      const position = findFrameResyncPosition(largeBuffer)
      expect(position).toBe(1000) // Should find the valid frame
    })

    it('handles buffer with only partial frame at end', () => {
      const buffer = [0xff, 0xff, 1] // Ends with partial valid frame
      expect(findFrameResyncPosition(buffer)).toBe(-1) // Should not find incomplete frame
    })

    it('handles ASCII protocol without resync', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Send corrupted ASCII frame
      const corruptedASCII = ':010302000AF1\r\n' // Wrong LRC
      client.handleResponse(
        new Uint8Array(Array.from(corruptedASCII).map((c) => c.charCodeAt(0)))
      )

      await expect(promise).rejects.toThrow(/LRC error/)

      // Buffer should be cleared completely for ASCII (no resync)
      const promise2 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      const validASCII = ':010302000AF0\r\n' // Correct LRC
      client.handleResponse(
        new Uint8Array(Array.from(validASCII).map((c) => c.charCodeAt(0)))
      )

      const result = await promise2
      expect(result.data).toEqual([10])
    })
  })
})
