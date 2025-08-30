import { describe, expect, it } from 'vitest'
import { calculateCRC16, calculateLRC, ModbusClient } from '../src/modbus.ts'

describe('Modbus Edge Cases for Complete Coverage', () => {
  describe('ASCII Protocol Edge Cases', () => {
    it('handles ASCII protocol switching', () => {
      const client = new ModbusClient()
      
      // Switch to ASCII protocol
      client.setProtocol('ascii')
      
      // Test read request in ASCII mode
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })
      
      // Send ASCII response
      const frame = [1, 3, 2, 0x12, 0x34]
      const lrc = calculateLRC(frame)
      frame.push(lrc)
      
      const hexString = frame
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('')
      
      const asciiFrame = `:${hexString}\r\n`
      const bytes = new Uint8Array(Array.from(asciiFrame).map(c => c.charCodeAt(0)))
      
      client.handleResponse(bytes)
      
      expect(promise).resolves.toBeTruthy()
    })

    it('handles invalid ASCII frame start', () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')
      
      const errorSpy = []
      client.on('error', (error) => errorSpy.push(error))
      
      // Set up pending request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send invalid frame (no : start)
      const invalidFrame = '01030200120034A1\r\n'
      const bytes = new Uint8Array(Array.from(invalidFrame).map(c => c.charCodeAt(0)))
      
      client.handleResponse(bytes)
      
      // Should emit error for invalid frame format
      expect(errorSpy.length).toBeGreaterThan(0)
    })

    it('handles ASCII frame with odd number of hex characters', () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')
      
      const errorSpy = []
      client.on('error', (error) => errorSpy.push(error))
      
      // Set up pending request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send frame with odd number of hex chars
      const invalidFrame = ':01030200120034A\r\n' // Missing one hex digit
      const bytes = new Uint8Array(Array.from(invalidFrame).map(c => c.charCodeAt(0)))
      
      client.handleResponse(bytes)
      
      // Should emit error for odd number of hex characters
      expect(errorSpy.length).toBeGreaterThan(0)
    })

    it('handles ASCII frame with invalid hex characters', () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')
      
      const errorSpy = []
      client.on('error', (error) => errorSpy.push(error))
      
      // Set up pending request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send frame with invalid hex characters
      const invalidFrame = ':0103020012003GH1\r\n' // 'G' and 'H' are invalid hex
      const bytes = new Uint8Array(Array.from(invalidFrame).map(c => c.charCodeAt(0)))
      
      client.handleResponse(bytes)
      
      // Should emit error for invalid hex pair
      expect(errorSpy.length).toBeGreaterThan(0)
    })

    it('handles ASCII frame too short', () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')
      
      const errorSpy = []
      client.on('error', (error) => errorSpy.push(error))
      
      // Set up pending request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send frame too short (less than 3 bytes when parsed)
      const invalidFrame = ':0103\r\n'
      const bytes = new Uint8Array(Array.from(invalidFrame).map(c => c.charCodeAt(0)))
      
      client.handleResponse(bytes)
      
      // Should emit error for frame too short
      expect(errorSpy.length).toBeGreaterThan(0)
    })

    it('handles ASCII exception frames', () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')
      
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })
      
      // Send exception frame (function code | 0x80)
      const frame = [1, 0x83, 0x02] // Exception: Illegal data address
      const lrc = calculateLRC(frame)
      frame.push(lrc)
      
      const hexString = frame
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('')
      
      const asciiFrame = `:${hexString}\r\n`
      const bytes = new Uint8Array(Array.from(asciiFrame).map(c => c.charCodeAt(0)))
      
      client.handleResponse(bytes)
      
      expect(promise).rejects.toThrow('Illegal data address')
    })

    it('handles ASCII exception frames too short', () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')
      
      const errorSpy = []
      client.on('error', (error) => errorSpy.push(error))
      
      // Set up pending request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send exception frame too short (missing error code)
      const frame = [1, 0x83] // Missing error code
      const lrc = calculateLRC(frame)
      frame.push(lrc)
      
      const hexString = frame
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('')
      
      const asciiFrame = `:${hexString}\r\n`
      const bytes = new Uint8Array(Array.from(asciiFrame).map(c => c.charCodeAt(0)))
      
      client.handleResponse(bytes)
      
      // Should emit error for invalid exception frame length
      expect(errorSpy.length).toBeGreaterThan(0)
    })

    it('handles ASCII write requests', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')
      
      const promise = client.write({
        functionCode: 6,
        address: 0x0001,
        slaveId: 1,
        value: 0x1234,
      })
      
      // Send ASCII write response
      const frame = [1, 6, 0x00, 0x01, 0x12, 0x34]
      const lrc = calculateLRC(frame)
      frame.push(lrc)
      
      const hexString = frame
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('')
      
      const asciiFrame = `:${hexString}\r\n`
      const bytes = new Uint8Array(Array.from(asciiFrame).map(c => c.charCodeAt(0)))
      
      client.handleResponse(bytes)
      
      await promise // Should complete without error
    })

    it('ignores ASCII response without pending request', () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')
      
      // Don't set up any pending request
      
      // Send ASCII response
      const frame = [1, 3, 2, 0x12, 0x34]
      const lrc = calculateLRC(frame)
      frame.push(lrc)
      
      const hexString = frame
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('')
      
      const asciiFrame = `:${hexString}\r\n`
      const bytes = new Uint8Array(Array.from(asciiFrame).map(c => c.charCodeAt(0)))
      
      // Should not crash
      expect(() => {
        client.handleResponse(bytes)
      }).not.toThrow()
    })

    it('handles partial ASCII frames across multiple calls', () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')
      
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })
      
      // Send ASCII response in parts
      const frame = [1, 3, 2, 0x12, 0x34]
      const lrc = calculateLRC(frame)
      frame.push(lrc)
      
      const hexString = frame
        .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('')
      
      const asciiFrame = `:${hexString}\r\n`
      
      // Send in parts: first the start and part of data
      const part1 = asciiFrame.substring(0, 8)
      const part2 = asciiFrame.substring(8)
      
      client.handleResponse(new Uint8Array(Array.from(part1).map(c => c.charCodeAt(0))))
      client.handleResponse(new Uint8Array(Array.from(part2).map(c => c.charCodeAt(0))))
      
      expect(promise).resolves.toBeTruthy()
    })
  })

  describe('RTU Error Handling Edge Cases', () => {
    it('handles CRC error in RTU mode', () => {
      const client = new ModbusClient()
      
      const errorSpy = []
      client.on('error', (error) => errorSpy.push(error))
      
      // Set up pending request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send frame with wrong CRC
      const frame = [1, 3, 2, 0x12, 0x34, 0xFF, 0xFF] // Wrong CRC
      client.handleResponse(new Uint8Array(frame))
      
      // Should emit CRC error
      expect(errorSpy.length).toBeGreaterThan(0)
      expect(errorSpy[0].message).toContain('CRC error')
    })

    it('handles responses for wrong slave ID', () => {
      const client = new ModbusClient()
      
      // Set up pending request for slave 1
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send response for slave 2
      const frame = [2, 3, 2, 0x12, 0x34] // Wrong slave ID
      const crc = calculateCRC16(frame)
      frame.push(crc & 0xff, (crc >> 8) & 0xff)
      
      // Should ignore this frame (no crash, no processing)
      expect(() => {
        client.handleResponse(new Uint8Array(frame))
      }).not.toThrow()
    })

    it('handles responses for wrong function code', () => {
      const client = new ModbusClient()
      
      // Set up pending request for FC03
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send response for FC04 (not an exception)
      const frame = [1, 4, 2, 0x12, 0x34] // Wrong function code
      const crc = calculateCRC16(frame)
      frame.push(crc & 0xff, (crc >> 8) & 0xff)
      
      // Should ignore this frame
      expect(() => {
        client.handleResponse(new Uint8Array(frame))
      }).not.toThrow()
    })

    it('handles incomplete frames gracefully', () => {
      const client = new ModbusClient()
      
      // Set up pending request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send incomplete frame (less than minimum 5 bytes)
      const incompleteFrame = [1, 3, 2]
      
      // Should not crash or process incomplete frame
      expect(() => {
        client.handleResponse(new Uint8Array(incompleteFrame))
      }).not.toThrow()
    })

    it('handles unknown exception codes', () => {
      const client = new ModbusClient()
      
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })
      
      // Send exception with unknown error code
      const frame = [1, 0x83, 0xFF] // Unknown error code 0xFF
      const crc = calculateCRC16(frame)
      frame.push(crc & 0xff, (crc >> 8) & 0xff)
      
      client.handleResponse(new Uint8Array(frame))
      
      expect(promise).rejects.toThrow('Modbus error 255')
    })
  })

  describe('Write Request Edge Cases', () => {
    it('handles FC15 with invalid value type', async () => {
      const client = new ModbusClient()
      
      // FC15 requires array value, but provide number
      await expect(client.write({
        functionCode: 15,
        address: 0,
        slaveId: 1,
        value: 123, // Should be array
      })).rejects.toThrow('FC15 requires value to be an array')
    })

    it('handles FC16 with invalid value type', async () => {
      const client = new ModbusClient()
      
      // FC16 requires array value, but provide number
      await expect(client.write({
        functionCode: 16,
        address: 0,
        slaveId: 1,
        value: 123, // Should be array
      })).rejects.toThrow('FC16 requires value to be an array')
    })
  })

  describe('Buffer Management Edge Cases', () => {
    it('clears buffer after CRC error', () => {
      const client = new ModbusClient()
      
      // Set up pending request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      }).catch(() => {})
      
      // Send frame with bad CRC
      const frame = [1, 3, 2, 0x12, 0x34, 0xFF, 0xFF]
      client.handleResponse(new Uint8Array(frame))
      
      // Now send a good frame - should work normally
      const goodFrame = [1, 3, 2, 0x56, 0x78]
      const crc = calculateCRC16(goodFrame)
      goodFrame.push(crc & 0xff, (crc >> 8) & 0xff)
      
      const promise2 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })
      
      client.handleResponse(new Uint8Array(goodFrame))
      
      expect(promise2).resolves.toBeTruthy()
    })
  })
})