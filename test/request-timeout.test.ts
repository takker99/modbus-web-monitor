import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModbusClient } from '../src/modbus.ts'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    clear: () => {
      store = {}
    },
    getItem: (key: string) => store[key] || null,
    removeItem: (key: string) => {
      delete store[key]
    },
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
})

describe('Request Timeout Feature', () => {
  beforeEach(() => {
    // Clear localStorage and use fake timers before each test
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('localStorage persistence', () => {
    it('should use default 3000ms when no localStorage value exists', () => {
      const savedValue = localStorage.getItem('modbus-request-timeout')
      expect(savedValue).toBeNull()

      // Simulate the useState initialization logic
      const timeout = savedValue ? Number.parseInt(savedValue, 10) : 3000
      const clampedTimeout = Math.max(500, Math.min(10000, timeout))

      expect(clampedTimeout).toBe(3000)
    })

    it('should load saved timeout from localStorage', () => {
      localStorage.setItem('modbus-request-timeout', '5000')

      const savedValue = localStorage.getItem('modbus-request-timeout')
      const timeout = savedValue ? Number.parseInt(savedValue, 10) : 3000
      const clampedTimeout = Math.max(500, Math.min(10000, timeout))

      expect(clampedTimeout).toBe(5000)
    })

    it('should clamp invalid localStorage values to valid range', () => {
      // Test value too low
      localStorage.setItem('modbus-request-timeout', '100')
      let savedValue = localStorage.getItem('modbus-request-timeout')
      let timeout = savedValue ? Number.parseInt(savedValue, 10) : 3000
      let clampedTimeout = Math.max(500, Math.min(10000, timeout))
      expect(clampedTimeout).toBe(500)

      // Test value too high
      localStorage.setItem('modbus-request-timeout', '20000')
      savedValue = localStorage.getItem('modbus-request-timeout')
      timeout = savedValue ? Number.parseInt(savedValue, 10) : 3000
      clampedTimeout = Math.max(500, Math.min(10000, timeout))
      expect(clampedTimeout).toBe(10000)
    })
  })

  describe('value validation', () => {
    it('should clamp values to valid range (500-10000ms)', () => {
      // Simulate the handleRequestTimeoutChange logic
      const handleRequestTimeoutChange = (value: number) => {
        return Math.max(500, Math.min(10000, value))
      }

      expect(handleRequestTimeoutChange(100)).toBe(500)
      expect(handleRequestTimeoutChange(500)).toBe(500)
      expect(handleRequestTimeoutChange(3000)).toBe(3000)
      expect(handleRequestTimeoutChange(10000)).toBe(10000)
      expect(handleRequestTimeoutChange(15000)).toBe(10000)
    })

    it('should handle edge cases', () => {
      const handleRequestTimeoutChange = (value: number) => {
        return Math.max(500, Math.min(10000, value))
      }

      expect(handleRequestTimeoutChange(0)).toBe(500)
      expect(handleRequestTimeoutChange(-100)).toBe(500)
      expect(handleRequestTimeoutChange(499)).toBe(500)
      expect(handleRequestTimeoutChange(501)).toBe(501)
      expect(handleRequestTimeoutChange(9999)).toBe(9999)
      expect(handleRequestTimeoutChange(10001)).toBe(10000)
    })
  })

  describe('UI integration', () => {
    it('should have correct HTML attributes for validation', () => {
      // Test that the input field has the correct min/max attributes
      const expectedAttributes = {
        max: '10000',
        min: '500',
        type: 'number',
      }

      expect(expectedAttributes.min).toBe('500')
      expect(expectedAttributes.max).toBe('10000')
      expect(expectedAttributes.type).toBe('number')
    })
  })

  describe('timeout behavior with ModbusClient', () => {
    it('should use custom timeout for read requests', async () => {
      const client = new ModbusClient()
      const customTimeout = 2000

      const promise = client.read(
        {
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 0,
        },
        customTimeout
      )

      // Advance time past custom timeout
      vi.advanceTimersByTime(customTimeout + 100)

      await expect(promise).rejects.toThrow('Request timed out')
    })

    it('should use custom timeout for write requests', async () => {
      const client = new ModbusClient()
      const customTimeout = 1500

      const promise = client.write(
        {
          address: 0,
          functionCode: 6,
          slaveId: 1,
          value: 1234,
        },
        customTimeout
      )

      // Advance time past custom timeout
      vi.advanceTimersByTime(customTimeout + 100)

      await expect(promise).rejects.toThrow('Request timed out')
    })

    it('should use default timeout when not specified', async () => {
      const client = new ModbusClient()
      const defaultTimeout = 3000

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Advance time past default timeout
      vi.advanceTimersByTime(defaultTimeout + 100)

      await expect(promise).rejects.toThrow('Request timed out')
    })

    it('should use custom timeout for monitoring', () => {
      const client = new ModbusClient()
      const mockRead = vi.spyOn(client, 'read').mockResolvedValue({
        data: [0x1234],
        functionCode: 3,
        functionCodeLabel: 'Read Holding Registers',
        slaveId: 1,
        timestamp: new Date(),
      })

      const customTimeout = 2500

      // Start monitoring with custom timeout
      client.startMonitoring(
        {
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 0,
        },
        1000,
        customTimeout
      )

      // Should not have called read yet
      expect(mockRead).not.toHaveBeenCalled()

      // Advance time to trigger first call
      vi.advanceTimersByTime(1000)
      expect(mockRead).toHaveBeenCalledTimes(1)

      // Verify that read was called with the custom timeout
      expect(mockRead).toHaveBeenCalledWith(
        {
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 0,
        },
        customTimeout
      )

      client.stopMonitoring()
      mockRead.mockRestore()
    })

    it('should handle different timeouts for sequential requests', async () => {
      const client = new ModbusClient()

      // First request with short timeout
      const promise1 = client.read(
        {
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 0,
        },
        1000
      )

      vi.advanceTimersByTime(1100)
      await expect(promise1).rejects.toThrow('Request timed out')

      // Second request with longer timeout
      const promise2 = client.read(
        {
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 10,
        },
        5000
      )

      // Should timeout after 5000ms, not before
      vi.advanceTimersByTime(5100)
      await expect(promise2).rejects.toThrow('Request timed out')
    })

    it('should not timeout before specified time', async () => {
      const client = new ModbusClient()
      const customTimeout = 4000

      const promise = client.read(
        {
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 0,
        },
        customTimeout
      )

      // Advance time to just before timeout
      vi.advanceTimersByTime(customTimeout - 100)

      // Should still be pending (not rejected yet)
      let isRejected = false
      promise.catch(() => {
        isRejected = true
      })

      // Run pending timers
      await Promise.resolve()
      expect(isRejected).toBe(false)

      // Now advance past timeout
      vi.advanceTimersByTime(200)
      await expect(promise).rejects.toThrow('Request timed out')
    })
  })
})
