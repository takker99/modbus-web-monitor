// Test file to validate ASCII edge cases and identify any gaps
import { describe, expect, it } from 'vitest'
import { calculateLRC, ModbusClient } from '../src/modbus.ts'

describe('ASCII Edge Cases Analysis', () => {
  it('handles invalid hex characters', async () => {
    const client = new ModbusClient()
    client.setProtocol('ascii')

    const errorSpy: Error[] = []
    client.on('error', (error) => errorSpy.push(error))

    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })

    // Frame with invalid hex character 'G'
    const responseFrame = ':01030G000AF0\r\n'
    client.handleResponse(
      new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
    )

    await expect(promise).rejects.toThrow(/Invalid hex pair/)
  })

  it('handles noise before frame start', async () => {
    const client = new ModbusClient()
    client.setProtocol('ascii')

    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })

    // Noise followed by valid frame
    const responseFrame = 'NOISE123ABC:010302000AF0\r\n'
    client.handleResponse(
      new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
    )

    const response = await promise
    expect(response.data).toEqual([10])
  })

  it('handles frame without proper ending', async () => {
    const client = new ModbusClient()
    client.setProtocol('ascii')

    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })

    // Frame without \r\n ending - should timeout
    const responseFrame = ':010302000AF0'
    client.handleResponse(
      new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
    )

    // This should timeout since frame never completes
    await expect(promise).rejects.toThrow(/Request timed out/)
  })

  it('handles odd number of hex characters', async () => {
    const client = new ModbusClient()
    client.setProtocol('ascii')

    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })

    // Frame with odd number of hex chars
    const responseFrame = ':01030200AF0\r\n' // Missing one char
    client.handleResponse(
      new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
    )

    await expect(promise).rejects.toThrow(/odd number of hex characters/)
  })

  it('handles frame too short', async () => {
    const client = new ModbusClient()
    client.setProtocol('ascii')

    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })

    // Frame too short (less than 3 bytes)
    const responseFrame = ':0103\r\n'
    client.handleResponse(
      new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
    )

    await expect(promise).rejects.toThrow(/ASCII frame too short/)
  })

  it('validates LRC calculation matches expected', () => {
    // Test the specific LRC calculation from the test
    const messageBytes = [0x01, 0x03, 0x02, 0x00, 0x0a] // from :010302000AF0
    const calculatedLRC = calculateLRC(messageBytes)
    expect(calculatedLRC).toBe(0xf0)
  })

  it('handles frames with only noise', async () => {
    const client = new ModbusClient()
    client.setProtocol('ascii')

    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })

    // Only noise, no valid frame
    const responseFrame = 'ABCDEFGHIJ123456'
    client.handleResponse(
      new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
    )

    // Should timeout waiting for frame
    await expect(promise).rejects.toThrow(/Request timed out/)
  })
})
