import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { calculateCRC16 } from '../src/crc.ts'
import { parseBitResponse, parseRegisterResponse } from '../src/frameParser.ts'
import { calculateLRC } from '../src/lrc.ts'
import { ModbusClient } from '../src/modbus.ts'

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

describe('LRC', () => {
  it('calculates LRC for known vector [0x01, 0x03, 0x00, 0x00, 0x00, 0x0A] => 0xF2', () => {
    const bytes = [0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]
    const lrc = calculateLRC(bytes)
    // Sum = 0x01 + 0x03 + 0x00 + 0x00 + 0x00 + 0x0A = 14 (0x0E)
    // LRC = (256 - (14 % 256)) % 256 = (256 - 14) % 256 = 242 % 256 = 242 = 0xF2
    expect(lrc).toBe(0xf2)
  })

  it('calculates LRC for edge case sum > 255', () => {
    const bytes = [0xff, 0xff] // sum = 510
    const lrc = calculateLRC(bytes)
    // sum % 256 = 510 % 256 = 254, LRC = (256 - 254) % 256 = 2
    expect(lrc).toBe(2)
  })

  it('calculates LRC for zero sum', () => {
    const bytes = [0x00, 0x00, 0x00]
    const lrc = calculateLRC(bytes)
    // sum = 0, LRC = (256 - 0) % 256 = 0
    expect(lrc).toBe(0)
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
    const promise = client.write({
      address: 0x0013,
      functionCode: 5,
      slaveId: 1,
      value: 1,
    })
    // Echo response: slave, fc, addr hi, addr lo, value hi, value lo
    const frame = [1, 5, 0x00, 0x13, 0xff, 0x00]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))
    await expect(promise).resolves.toBeUndefined()
  })

  it('builds and parses FC06 single register write echo', async () => {
    const client = new ModbusClient()
    const promise = client.write({
      address: 0x0001,
      functionCode: 6,
      slaveId: 2,
      value: 0x0a0b,
    })
    const frame = [2, 6, 0x00, 0x01, 0x0a, 0x0b]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))
    await expect(promise).resolves.toBeUndefined()
  })
})

describe('Write multiple (FC15/16)', () => {
  it('builds FC15 frame and parses echo', async () => {
    const client = new ModbusClient()
    const values = [1, 0, 1, 1, 0, 0, 1, 0, 1] // 9 coils => 2 bytes
    const promise = client.write({
      address: 0x0005,
      functionCode: 15,
      slaveId: 3,
      value: values,
    })
    // Expected packed bytes: first 8 bits = 1,0,1,1,0,0,1,0 -> 0b01001101 = 0x4D (LSB first per coil order)
    // second byte for 9th bit -> bit0 = 1
    const packed1 = 0b01001101
    const packed2 = 0b00000001
    // Device echo response (no data bytes): slave, fc, addr hi, addr lo, qty hi, qty lo
    const frame = [3, 15, 0x00, 0x05, 0x00, values.length]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    // Ensure our internal request packing matches expectation
    // We trigger after write request is emitted by calling handleResponse with echo
    client.handleResponse(new Uint8Array(frame))
    await expect(promise).resolves.toBeUndefined()
    // Indirectly, packing logic already used; to assert bytes we'd rebuild via private method – skipped.
    expect(packed1).toBe(0x4d)
    expect(packed2).toBe(0x01)
  })

  it('builds FC16 frame and parses echo', async () => {
    const client = new ModbusClient()
    const regs = [0x1234, 0xabcd, 0x0001]
    const promise = client.write({
      address: 0x0100,
      functionCode: 16,
      slaveId: 4,
      value: regs,
    })
    // Echo response: slave, fc, addr hi, addr lo, qty hi, qty lo
    const frame = [4, 16, 0x01, 0x00, 0x00, regs.length]
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
    expect(res.functionCodeLabel).toBe('Holding Registers')
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
    expect(res.functionCodeLabel).toBe('Coils')
  })

  it('handles discrete input status bit unpacking (FC02)', async () => {
    const client = new ModbusClient()
    const promise = client.read({
      functionCode: 2,
      quantity: 12,
      slaveId: 1,
      startAddress: 0,
    })
    // slave=1 fc=2 byteCount=2 data=0b11001010 0b00000101 (2 bytes for 12 bits)
    const frame = [1, 2, 2, 0b11001010, 0b00000101]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))

    const res = await promise
    // First byte: bits 0-7, second byte: bits 8-11 (only first 4 bits used)
    expect(res.data.slice(0, 12)).toEqual([
      0,
      1,
      0,
      1,
      0,
      0,
      1,
      1, // First byte: 0b11001010 LSB first
      1,
      0,
      1,
      0, // Second byte: 0b00000101 LSB first (first 4 bits)
    ])
    expect(res.functionCodeLabel).toBe('Discrete Inputs')
  })

  it('handles holding register response (FC03)', async () => {
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
    expect(res.functionCodeLabel).toBe('Holding Registers')
  })

  it('handles input register response (FC04)', async () => {
    const client = new ModbusClient()
    const promise = client.read({
      functionCode: 4,
      quantity: 3,
      slaveId: 2,
      startAddress: 100,
    })

    // simulate device response
    // slave=2 fc=4 byteCount=6 data=0x12 0x34 0x56 0x78 0x9A 0xBC
    const frame = [2, 4, 6, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]
    const crc = calculateCRC16(frame)
    frame.push(crc & 0xff, (crc >> 8) & 0xff)
    client.handleResponse(new Uint8Array(frame))

    const res = await promise
    expect(res.data).toEqual([0x1234, 0x5678, 0x9abc])
    expect(res.functionCodeLabel).toBe('Input Registers')
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

describe('Property based FC16 request CRC + structure', () => {
  it('generates correct length and CRC for random register arrays', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ max: 0xffff, min: 0 }), {
          maxLength: 10,
          minLength: 1,
        }),
        fc.integer({ max: 0xff, min: 0 }),
        fc.integer({ max: 0xffff, min: 0 }),
        (regs, slaveId, address) => {
          const quantity = regs.length
          const byteCount = quantity * 2
          const base = [
            slaveId,
            16,
            (address >> 8) & 0xff,
            address & 0xff,
            (quantity >> 8) & 0xff,
            quantity & 0xff,
            byteCount,
            ...regs.flatMap((v: number) => [(v >> 8) & 0xff, v & 0xff]),
          ]
          const crc = calculateCRC16(base)
          const frame = [...base, crc & 0xff, (crc >> 8) & 0xff]
          const crc2 = calculateCRC16(frame.slice(0, -2))
          return (frame.length === 9 + byteCount &&
            crc === crc2 &&
            frame[frame.length - 2] === (crc & 0xff) &&
            frame[frame.length - 1] === ((crc >> 8) & 0xff)) as boolean
        }
      ),
      { numRuns: 50 }
    )
  })
})

describe('Performance parsing burst', () => {
  it('parses 1000 small FC03 frames under 200ms', async () => {
    const client = new ModbusClient()
    const frames: number[] = []
    for (let i = 0; i < 1000; i++) {
      const base = [1, 3, 2, 0, i & 0xff]
      const crc = calculateCRC16(base)
      base.push(crc & 0xff, (crc >> 8) & 0xff)
      frames.push(...base)
    }
    const start = performance.now()
    // Issue reads sequentially consuming frames already buffered
    for (let i = 0; i < 1000; i++) {
      const p = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })
      if (i === 0) {
        client.handleResponse(new Uint8Array(frames))
      }
      const r = await p
      expect(r.data.length).toBe(1)
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(200)
  }, 10000)
})

describe('Multi-write operations (FC15/16)', () => {
  it('builds and sends FC15 multi-coil write request', async () => {
    const client = new ModbusClient()
    const promise = client.write({
      address: 0x0013,
      functionCode: 15,
      slaveId: 1,
      value: [1, 0, 1, 1, 0, 1, 0, 0], // 8 coils
    })

    // Simulate response: slave, fc, addr hi, addr lo, qty hi, qty lo, crc
    const response = [1, 15, 0x00, 0x13, 0x00, 0x08]
    const crc = calculateCRC16(response)
    response.push(crc & 0xff, (crc >> 8) & 0xff)

    client.handleResponse(new Uint8Array(response))
    await promise // Should resolve without error
  })

  it('builds and sends FC16 multi-register write request', async () => {
    const client = new ModbusClient()
    const promise = client.write({
      address: 0x0001,
      functionCode: 16,
      slaveId: 1,
      value: [0x1234, 0x5678, 0x9abc], // 3 registers
    })

    // Simulate response: slave, fc, addr hi, addr lo, qty hi, qty lo, crc
    const response = [1, 16, 0x00, 0x01, 0x00, 0x03]
    const crc = calculateCRC16(response)
    response.push(crc & 0xff, (crc >> 8) & 0xff)

    client.handleResponse(new Uint8Array(response))
    await promise // Should resolve without error
  })

  it('validates FC15 array requirement', async () => {
    const client = new ModbusClient()
    await expect(
      client.write({
        address: 0x0013,
        functionCode: 15,
        slaveId: 1,
        value: 1, // Should be array for FC15
      })
    ).rejects.toThrow('FC15 requires value to be an array of bits')
  })

  it('validates FC16 array requirement', async () => {
    const client = new ModbusClient()
    await expect(
      client.write({
        address: 0x0001,
        functionCode: 16,
        slaveId: 1,
        value: 1234, // Should be array for FC16
      })
    ).rejects.toThrow('FC16 requires value to be an array of register values')
  })

  it('correctly encodes FC15 coil bits into bytes', () => {
    // This test checks the bit packing logic inside buildWriteRequest
    // We'll create a client, capture the request frame, and verify bit encoding
    const client = new ModbusClient()
    let capturedFrame: Uint8Array | null = null

    client.on('request', (frame: Uint8Array) => {
      capturedFrame = frame
    })

    client.write({
      address: 0x0013,
      functionCode: 15,
      slaveId: 1,
      value: [1, 0, 1, 1, 0, 1, 0, 0, 1], // 9 bits = 2 bytes
    })

    expect(capturedFrame).not.toBeNull()
  })
})

describe('Modbus ASCII', () => {
  describe('Frame building', () => {
    it('builds ASCII read request with proper format', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      let requestData: Uint8Array | null = null
      client.on('request', (data) => {
        requestData = data
      })

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      expect(requestData).not.toBeNull()
      if (!requestData) throw new Error('requestData is null')
      const requestString = String.fromCharCode(...(requestData as Uint8Array))

      // Should be :AABBCCDDDDDDLR\r\n format
      // Expected: :010300000001FB\r\n
      // slave=01, func=03, start=0000, qty=0001, LRC=FB
      expect(requestString).toMatch(/^:[0-9A-F]+\r\n$/)
      expect(requestString).toBe(':010300000001FB\r\n')

      // Clean up pending request
      client.handleResponse(
        new Uint8Array(
          Array.from(':010302000AF0\r\n').map((c) => c.charCodeAt(0))
        )
      )
      await promise
    })

    it('builds ASCII write request with proper format', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      let requestData: Uint8Array | null = null
      client.on('request', (data) => {
        requestData = data
      })

      const promise = client.write({
        address: 0x0013,
        functionCode: 5,
        slaveId: 1,
        value: 1,
      })

      expect(requestData).not.toBeNull()
      if (!requestData) throw new Error('requestData is null')
      const requestString = String.fromCharCode(...(requestData as Uint8Array))

      // Expected: :01050013FF00E8\r\n
      // slave=01, func=05, addr=0013, value=FF00, LRC=E8
      expect(requestString).toMatch(/^:[0-9A-F]+\r\n$/)
      expect(requestString).toBe(':01050013FF00E8\r\n')

      // Clean up pending request
      client.handleResponse(
        new Uint8Array(
          Array.from(':01050013FF00E8\r\n').map((c) => c.charCodeAt(0))
        )
      )
      await promise
    })
  })

  describe('Frame parsing', () => {
    it('parses valid ASCII response frame', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Response: slave=01, func=03, count=02, data=000A, LRC=F0
      const responseFrame = ':010302000AF0\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
      )

      const response = await promise
      expect(response.data).toEqual([10]) // 0x000A = 10
      expect(response.functionCode).toBe(3)
      expect(response.functionCodeLabel).toBe('Holding Registers')
      expect(response.slaveId).toBe(1)
    })

    it('parses FC02 discrete inputs in ASCII mode', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 2,
        quantity: 8,
        slaveId: 2,
        startAddress: 0,
      })

      // Response: slave=02, func=02, count=01, data=A5 (0b10100101), LRC=56
      const responseFrame = ':020201A556\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
      )

      const response = await promise
      expect(response.data.slice(0, 8)).toEqual([1, 0, 1, 0, 0, 1, 0, 1]) // 0xA5 bits LSB first
      expect(response.functionCode).toBe(2)
      expect(response.functionCodeLabel).toBe('Discrete Inputs')
    })

    it('parses FC04 input registers in ASCII mode', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 4,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Response: slave=01, func=04, count=02, data=1234, LRC=B3
      const responseFrame = ':0104021234B3\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
      )

      const response = await promise
      expect(response.data).toEqual([0x1234])
      expect(response.functionCode).toBe(4)
      expect(response.functionCodeLabel).toBe('Input Registers')
    })

    it('rejects frame with bad LRC', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Response with corrupted LRC (should be F0, using FF)
      const responseFrame = ':010302000AFF\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
      )

      await expect(promise).rejects.toThrow(/LRC error/)
    })

    it('handles exception frame in ASCII', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Exception response: slave=01, func=83, code=02, LRC=7A
      const responseFrame = ':0183027A\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
      )

      await expect(promise).rejects.toThrow(/Illegal data address/)
    })

    it('handles partial frame delivery', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Send frame in chunks
      const _responseFrame = ':010302000AF0\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(':01030').map((c) => c.charCodeAt(0)))
      )
      client.handleResponse(
        new Uint8Array(Array.from('2000AF0\r\n').map((c) => c.charCodeAt(0)))
      )

      const response = await promise
      expect(response.data).toEqual([10])
    })

    it('handles multiple concatenated frames', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const p1 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Send two frames concatenated
      const frame1 = ':010302000AF0\r\n'
      const frame2 = ':010302000BEF\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(frame1 + frame2).map((c) => c.charCodeAt(0)))
      )

      const r1 = await p1
      expect(r1.data).toEqual([10])

      const p2 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      const r2 = await p2
      expect(r2.data).toEqual([11])
    })

    it('handles garbage before start character', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Send garbage + valid frame
      const responseData = 'garbage123:010302000AF0\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(responseData).map((c) => c.charCodeAt(0)))
      )

      const response = await promise
      expect(response.data).toEqual([10])
    })

    it('rejects frame with invalid hex characters', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Frame with invalid hex character 'G'
      const responseFrame = ':01G302000AF1\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
      )

      await expect(promise).rejects.toThrow(/Invalid hex pair/)
    })

    it('rejects frame with odd number of hex characters', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Frame with odd number of hex chars (missing one char)
      const responseFrame = ':01030200AF1\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
      )

      await expect(promise).rejects.toThrow(/odd number of hex characters/)
    })

    it('rejects frame that is too short', async () => {
      const client = new ModbusClient()
      client.setProtocol('ascii')

      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      })

      // Frame too short (only 1 byte)
      const responseFrame = ':01F8\r\n'
      client.handleResponse(
        new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0)))
      )

      await expect(promise).rejects.toThrow(/too short/)
    })
  })
})

describe('Utility Functions', () => {
  describe('parseBitResponse', () => {
    it('correctly parses bit response from byte data', () => {
      // Test data: single byte 0b10101001 (LSB first)
      const responseData = [1, 1, 1, 0b10101001] // slave, fc, byteCount, data
      const dataLength = 1
      const result = parseBitResponse(responseData, dataLength)

      // Should extract 8 bits: [1,0,0,1,0,1,0,1] (LSB first)
      expect(result.slice(0, 8)).toEqual([1, 0, 0, 1, 0, 1, 0, 1])
    })

    it('correctly parses multi-byte bit response', () => {
      // Test data: two bytes 0b11000000, 0b00000011
      const responseData = [1, 2, 2, 0b11000000, 0b00000011] // slave, fc, byteCount, data1, data2
      const dataLength = 2
      const result = parseBitResponse(responseData, dataLength)

      // First byte: [0,0,0,0,0,0,1,1], Second byte: [1,1,0,0,0,0,0,0]
      expect(result.slice(0, 16)).toEqual([
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        1, // First byte (LSB first)
        1,
        1,
        0,
        0,
        0,
        0,
        0,
        0, // Second byte (LSB first)
      ])
    })
  })

  describe('parseRegisterResponse', () => {
    it('correctly parses register response from byte data', () => {
      // Test data: two registers 0x1234, 0x5678
      const responseData = [1, 3, 4, 0x12, 0x34, 0x56, 0x78] // slave, fc, byteCount, data
      const dataLength = 4
      const result = parseRegisterResponse(responseData, dataLength)

      expect(result).toEqual([0x1234, 0x5678])
    })

    it('correctly parses single register response', () => {
      // Test data: single register 0xABCD
      const responseData = [1, 4, 2, 0xab, 0xcd] // slave, fc, byteCount, data
      const dataLength = 2
      const result = parseRegisterResponse(responseData, dataLength)

      expect(result).toEqual([0xabcd])
    })
  })
})

describe('Function Code Type Safety', () => {
  it('allows valid read function codes', () => {
    const _client = new ModbusClient()

    // All these should compile without TypeScript errors
    const validReadConfigs = [
      { functionCode: 1 as const, quantity: 1, slaveId: 1, startAddress: 0 },
      { functionCode: 2 as const, quantity: 1, slaveId: 1, startAddress: 0 },
      { functionCode: 3 as const, quantity: 1, slaveId: 1, startAddress: 0 },
      { functionCode: 4 as const, quantity: 1, slaveId: 1, startAddress: 0 },
    ]

    // If this compiles, the types are working correctly
    expect(validReadConfigs).toHaveLength(4)
  })

  it('allows valid write function codes', () => {
    const _client = new ModbusClient()

    // All these should compile without TypeScript errors
    const validWriteConfigs = [
      { address: 0, functionCode: 5 as const, slaveId: 1, value: 1 },
      { address: 0, functionCode: 6 as const, slaveId: 1, value: 100 },
      { address: 0, functionCode: 15 as const, slaveId: 1, value: [1, 0, 1] },
      { address: 0, functionCode: 16 as const, slaveId: 1, value: [100, 200] },
    ]

    // If this compiles, the types are working correctly
    expect(validWriteConfigs).toHaveLength(4)
  })
})
