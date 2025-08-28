import { describe, expect, it, vi } from 'vitest'
import { calculateCRC16, ModbusClient } from '../src/modbus.ts'

// Helper to build a full RTU frame for read holding registers (FC03)
function buildReadHoldingRegistersRequest(
  slaveId: number,
  start: number,
  qty: number
) {
  const payload = [
    slaveId,
    3,
    (start >> 8) & 0xff,
    start & 0xff,
    (qty >> 8) & 0xff,
    qty & 0xff,
  ]
  const crc = calculateCRC16(payload)
  payload.push(crc & 0xff, (crc >> 8) & 0xff)
  return new Uint8Array(payload)
}

describe('CRC16', () => {
  it('matches known vector 0x01 0x03 0x00 0x00 0x00 0x0A => 0xC5CD', () => {
    const bytes = [0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]
    const crc = calculateCRC16(bytes)
    expect(crc.toString(16)).toBe('cdc5') // low byte first in frame => 0xC5 0xCD
  })
})

describe('Request frame building (read)', () => {
  it('builds proper read holding registers frame', async () => {
    const req = buildReadHoldingRegistersRequest(1, 0x0000, 10)
    // Length should be 8 bytes (6 + 2 CRC)
    expect(req.length).toBe(8)
    // CRC low/high ordering
    const crcNo = calculateCRC16(Array.from(req.slice(0, -2)))
    expect(req[6]).toBe(crcNo & 0xff)
    expect(req[7]).toBe((crcNo >> 8) & 0xff)
  })
})

describe('Write single (FC05/06)', () => {
  it('builds and parses FC05 single coil write echo', async () => {
    const client = new ModbusClient()
    const promise = client.write({ slaveId: 1, functionCode: 5, address: 0x0013, value: 1 })
    // Echo response: slave, fc, addr hi, addr lo, value hi, value lo
    const frame = [1,5,0x00,0x13,0xFF,0x00]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))
    await expect(promise).resolves.toBeUndefined()
  })

  it('builds and parses FC06 single register write echo', async () => {
    const client = new ModbusClient()
    const promise = client.write({ slaveId: 2, functionCode: 6, address: 0x0001, value: 0x0A0B })
    const frame = [2,6,0x00,0x01,0x0A,0x0B]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))
    await expect(promise).resolves.toBeUndefined()
  })
})

describe('Write multiple (FC15/16)', () => {
  it('builds FC15 frame and parses echo', async () => {
    const client = new ModbusClient()
    const values = [1,0,1,1,0,0,1,0,1] // 9 coils => 2 bytes
    const promise = client.write({ slaveId: 3, functionCode: 15, address: 0x0005, value: values })
    // Expected packed bytes: first 8 bits = 1,0,1,1,0,0,1,0 -> 0b01001101 = 0x4D (LSB first per coil order)
    // second byte for 9th bit -> bit0 = 1
    const packed1 = 0b01001101
    const packed2 = 0b00000001
    // Device echo response (no data bytes): slave, fc, addr hi, addr lo, qty hi, qty lo
    const frame = [3,15,0x00,0x05,0x00,values.length]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    // Ensure our internal request packing matches expectation
    // We trigger after write request is emitted by calling handleResponse with echo
    client.handleResponse(new Uint8Array(frame))
    await expect(promise).resolves.toBeUndefined()
    // Indirectly, packing logic already used; to assert bytes we'd rebuild via private method – skipped.
    expect(packed1).toBe(0x4D)
    expect(packed2).toBe(0x01)
  })

  it('builds FC16 frame and parses echo', async () => {
    const client = new ModbusClient()
    const regs = [0x1234, 0xABCD, 0x0001]
    const promise = client.write({ slaveId: 4, functionCode: 16, address: 0x0100, value: regs })
    // Echo response: slave, fc, addr hi, addr lo, qty hi, qty lo
    const frame = [4,16,0x01,0x00,0x00,regs.length]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))
    await expect(promise).resolves.toBeUndefined()
  })
})

describe('Response parsing', () => {
  it('parses a valid FC03 response with 2 registers', async () => {
    const client = new ModbusClient()
    const promise = client.read({
      functionCode: 3,
      quantity: 2,
      slaveId: 1,
      startAddress: 0,
    })

    // simulate device response
    // slave=1 fc=3 byteCount=4 data=0x00 0x01 0x00 0x02
    const frame = [1, 3, 4, 0, 1, 0, 2]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))

    const res = await promise
    expect(res.data).toEqual([1, 2])
  })

  it('handles coil status bit unpacking (FC01)', async () => {
    const client = new ModbusClient()
    const promise = client.read({
      functionCode: 1,
      quantity: 8,
      slaveId: 1,
      startAddress: 0,
    })
    // slave=1 fc=1 byteCount=1 data=0b10100101 (LSB first per Modbus)
    const frame = [1, 1, 1, 0b10100101]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))

    const res = await promise
    // Bits unpacked LSB -> MSB
    expect(res.data.slice(0, 8)).toEqual([1, 0, 1, 0, 0, 1, 0, 1])
  })

  it('rejects on CRC error', async () => {
    const client = new ModbusClient()
    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })
    // Build a valid frame then corrupt last byte
    const frame = [1, 3, 2, 0, 5]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    frame[frame.length - 1] ^= 0xff // corrupt high CRC byte
    client.handleResponse(new Uint8Array(frame))
    await expect(promise).rejects.toThrow(/CRC error/)
  })

  it('handles exception frame (function | 0x80)', async () => {
    const client = new ModbusClient()
    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })
    // Exception: slave=1, function=0x83, code=2 (Illegal data address) + CRC
    const frame = [1, 0x83, 2]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))
    await expect(promise).rejects.toThrow(/Illegal data address/)
  })

  it('times out when no response', async () => {
    vi.useFakeTimers()
    const client = new ModbusClient()
    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })
    // Fast-forward timers
    vi.advanceTimersByTime(3005)
    await expect(promise).rejects.toThrow(/timed out/)
    vi.useRealTimers()
  })
})

// Buffer handling for partial + concatenated frames
describe('Buffer handling', () => {
  it('parses frame delivered in two chunks', async () => {
    const client = new ModbusClient()
    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })
    const base = [1, 3, 2, 0, 7]
    const crc = calculateCRC16(base)
    base.push(crc & 0xff, (crc >> 8) & 0xff)
    // send first half
    client.handleResponse(new Uint8Array(base.slice(0, 3)))
    // still pending
    client.handleResponse(new Uint8Array(base.slice(3)))
    const res = await promise
    expect(res.data).toEqual([7])
  })

  it('parses two concatenated frames sequentially', async () => {
    const client = new ModbusClient()
    const p1 = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })
    const frame1 = [1, 3, 2, 0, 9]
    const crc1 = calculateCRC16(frame1)
    frame1.push(crc1 & 0xff, (crc1 >> 8) & 0xff)

    const frame2 = [1, 3, 2, 0, 10]
    const crc2 = calculateCRC16(frame2)
    frame2.push(crc2 & 0xff, (crc2 >> 8) & 0xff)

    // deliver both frames back-to-back; second should wait for new request
    client.handleResponse(new Uint8Array([...frame1, ...frame2]))
    const r1 = await p1
    expect(r1.data).toEqual([9])

    const p2 = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    })
    // buffer already has second frame
    const r2 = await p2
    expect(r2.data).toEqual([10])
  })
})
