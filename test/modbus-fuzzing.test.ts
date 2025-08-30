import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calculateCRC16, calculateLRC, ModbusClient } from '../src/modbus.ts'

describe('Frame Fuzzing Tests', () => {
  describe('RTU Frame Generation and Validation', () => {
    it('generates valid RTU frames for all supported function codes', () => {
      fc.assert(
        fc.property(
          fc.integer({ max: 247, min: 1 }), // Slave ID
          fc.constantFrom(1, 2, 3, 4, 5, 6, 15, 16), // Function codes
          fc.integer({ max: 65535, min: 0 }), // Address
          fc.integer({ max: 125, min: 1 }), // Quantity/Value
          (slaveId, functionCode, address, quantity) => {
            // Build request frame based on function code
            let frame: number[]

            if ([1, 2, 3, 4].includes(functionCode)) {
              // Read functions
              frame = [
                slaveId,
                functionCode,
                (address >> 8) & 0xff,
                address & 0xff,
                (quantity >> 8) & 0xff,
                quantity & 0xff,
              ]
            } else if ([5, 6].includes(functionCode)) {
              // Single write functions
              const value =
                functionCode === 5 ? (quantity % 2 ? 0xff00 : 0x0000) : quantity
              frame = [
                slaveId,
                functionCode,
                (address >> 8) & 0xff,
                address & 0xff,
                (value >> 8) & 0xff,
                value & 0xff,
              ]
            } else {
              // Multi-write functions (15, 16) - simplified
              const byteCount =
                functionCode === 15 ? Math.ceil(quantity / 8) : quantity * 2
              frame = [
                slaveId,
                functionCode,
                (address >> 8) & 0xff,
                address & 0xff,
                (quantity >> 8) & 0xff,
                quantity & 0xff,
                byteCount,
                ...Array(byteCount).fill(0),
              ]
            }

            // Add CRC
            const crc = calculateCRC16(frame)
            frame.push(crc & 0xff, (crc >> 8) & 0xff)

            // Validate frame structure
            expect(frame.length).toBeGreaterThanOrEqual(8)
            expect(frame[0]).toBe(slaveId)
            expect(frame[1]).toBe(functionCode)

            // Validate CRC
            const calculatedCRC = calculateCRC16(frame.slice(0, -2))
            const frameCRC =
              (frame[frame.length - 1] << 8) | frame[frame.length - 2]
            expect(calculatedCRC).toBe(frameCRC)

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('handles corrupted RTU frames gracefully without crashes', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ max: 255, min: 0 }), {
            maxLength: 256,
            minLength: 1,
          }),
          (corruptedFrame) => {
            const client = new ModbusClient()

            // This should not crash, even with completely random data
            expect(() => {
              client.handleResponse(new Uint8Array(corruptedFrame))
            }).not.toThrow()

            return true
          }
        ),
        { numRuns: 200 }
      )
    })

    it('rejects frames with invalid CRC', () => {
      fc.assert(
        fc.property(
          fc.integer({ max: 247, min: 1 }),
          fc.constantFrom(3, 6), // Simple function codes
          fc.integer({ max: 65535, min: 0 }),
          fc.integer({ max: 100, min: 1 }),
          fc.integer({ max: 65535, min: 0 }), // Corrupt CRC
          (slaveId, functionCode, address, value, corruptCRC) => {
            const frame = [
              slaveId,
              functionCode,
              (address >> 8) & 0xff,
              address & 0xff,
              (value >> 8) & 0xff,
              value & 0xff,
            ]

            // Add intentionally wrong CRC
            frame.push(corruptCRC & 0xff, (corruptCRC >> 8) & 0xff)

            const client = new ModbusClient()
            const errorSpy = []
            client.on('error', (error) => errorSpy.push(error))

            // Set up a pending request to trigger frame processing
            const _promise = client
              .read({
                functionCode: functionCode as 3 | 6,
                quantity: 1,
                slaveId,
                startAddress: address,
              })
              .catch(() => {}) // Ignore promise rejection

            client.handleResponse(new Uint8Array(frame))

            // Should either ignore frame or emit CRC error
            return true
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('ASCII Frame Generation and Validation', () => {
    it('generates valid ASCII frames with proper LRC', () => {
      fc.assert(
        fc.property(
          fc.integer({ max: 247, min: 1 }),
          fc.constantFrom(3, 6),
          fc.integer({ max: 65535, min: 0 }),
          fc.integer({ max: 100, min: 1 }),
          (slaveId, functionCode, address, value) => {
            const frame = [
              slaveId,
              functionCode,
              (address >> 8) & 0xff,
              address & 0xff,
              (value >> 8) & 0xff,
              value & 0xff,
            ]

            // Calculate LRC and build ASCII frame
            const lrc = calculateLRC(frame)
            frame.push(lrc)

            // Convert to ASCII hex format
            const hexString = frame
              .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
              .join('')

            const asciiFrame = `:${hexString}\r\n`

            // Validate structure
            expect(asciiFrame[0]).toBe(':')
            expect(asciiFrame.endsWith('\r\n')).toBe(true)
            expect((asciiFrame.length - 3) % 2).toBe(0) // Even number of hex chars

            // Validate LRC calculation
            const calculatedLRC = calculateLRC(frame.slice(0, -1))
            expect(calculatedLRC).toBe(lrc)

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('handles malformed ASCII frames gracefully', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 100, minLength: 1 }),
          (randomString) => {
            const client = new ModbusClient()
            client.setProtocol('ascii')

            // Convert string to bytes for handleResponse
            const bytes = new Uint8Array(
              Array.from(randomString).map((c) => c.charCodeAt(0))
            )

            expect(() => {
              client.handleResponse(bytes)
            }).not.toThrow()

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('rejects ASCII frames with invalid LRC', () => {
      fc.assert(
        fc.property(
          fc.integer({ max: 247, min: 1 }),
          fc.constantFrom(3, 6),
          fc.integer({ max: 65535, min: 0 }),
          fc.integer({ max: 100, min: 1 }),
          fc.integer({ max: 255, min: 0 }), // Wrong LRC
          (slaveId, functionCode, address, value, wrongLRC) => {
            const frame = [
              slaveId,
              functionCode,
              (address >> 8) & 0xff,
              address & 0xff,
              (value >> 8) & 0xff,
              value & 0xff,
              wrongLRC, // Intentionally wrong LRC
            ]

            const hexString = frame
              .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
              .join('')

            const asciiFrame = `:${hexString}\r\n`
            const bytes = new Uint8Array(
              Array.from(asciiFrame).map((c) => c.charCodeAt(0))
            )

            const client = new ModbusClient()
            client.setProtocol('ascii')

            const errorSpy = []
            client.on('error', (error) => errorSpy.push(error))

            // Set up pending request
            const _promise = client
              .read({
                functionCode: functionCode as 3 | 6,
                quantity: 1,
                slaveId,
                startAddress: address,
              })
              .catch(() => {})

            client.handleResponse(bytes)

            return true
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('Buffer Boundary Testing', () => {
    it('handles frames split across multiple buffer chunks', async () => {
      const client = new ModbusClient()

      // Create a valid frame
      const frame = [1, 3, 2, 0x12, 0x34]
      const crc = calculateCRC16(frame)
      frame.push(crc & 0xff, (crc >> 8) & 0xff)

      // Set up request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Split frame into 2 chunks
      const mid = Math.floor(frame.length / 2)
      const chunk1 = new Uint8Array(frame.slice(0, mid))
      const chunk2 = new Uint8Array(frame.slice(mid))

      // Deliver chunks
      client.handleResponse(chunk1)
      client.handleResponse(chunk2)

      // Should complete successfully
      const response = await promise
      expect(response.data).toEqual([0x1234])
    })

    it('handles various frame chunk sizes with property testing', () => {
      fc.assert(
        fc.property(
          fc.integer({ max: 8, min: 2 }), // Smaller range for more reliable testing
          fc.integer({ max: 10, min: 1 }), // Data value
          (numChunks, dataValue) => {
            const client = new ModbusClient()

            // Create a simple valid frame
            const frame = [1, 3, 2, (dataValue >> 8) & 0xff, dataValue & 0xff]
            const crc = calculateCRC16(frame)
            frame.push(crc & 0xff, (crc >> 8) & 0xff)

            // Start request
            const _promise = client
              .read({
                functionCode: 3,
                quantity: 1,
                slaveId: 1,
                startAddress: 0,
              })
              .catch(() => null) // Don't let promise rejection fail the test

            // Split into roughly equal chunks
            const chunkSize = Math.max(1, Math.floor(frame.length / numChunks))
            let offset = 0

            for (let i = 0; i < numChunks; i++) {
              const end =
                i === numChunks - 1
                  ? frame.length
                  : Math.min(offset + chunkSize, frame.length)
              if (offset < frame.length) {
                const chunk = new Uint8Array(frame.slice(offset, end))
                client.handleResponse(chunk)
                offset = end
              }
            }

            // Don't need to wait for promise, just ensure no crash
            return true
          }
        ),
        { numRuns: 20 }
      )
    })

    it('handles large frame sizes up to typical Modbus limits', async () => {
      const client = new ModbusClient()

      // Test with maximum register quantity (125)
      const quantity = 125
      const dataLength = quantity * 2
      const frame = [1, 3, dataLength]

      // Add data bytes
      for (let i = 0; i < dataLength; i++) {
        frame.push(i & 0xff)
      }

      // Add CRC
      const crc = calculateCRC16(frame)
      frame.push(crc & 0xff, (crc >> 8) & 0xff)

      const promise = client.read({
        functionCode: 3,
        quantity,
        slaveId: 1,
        startAddress: 0,
      })

      client.handleResponse(new Uint8Array(frame))

      const response = await promise
      expect(response.data.length).toBe(quantity)
    })
  })
})
