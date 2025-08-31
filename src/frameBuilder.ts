// Pure functions for building Modbus frames (RTU and ASCII)

import { calculateCRC16 } from './crc.ts'
import { calculateLRC } from './lrc.ts'
import type { ModbusReadConfig, ModbusWriteConfig } from './types.ts'

export type ModbusProtocol = 'rtu' | 'ascii'

// Build a Modbus read request frame
export function buildReadRequest(
  config: ModbusReadConfig,
  protocol: ModbusProtocol = 'rtu'
): Uint8Array {
  const request = [
    config.slaveId,
    config.functionCode,
    (config.startAddress >> 8) & 0xff,
    config.startAddress & 0xff,
    (config.quantity >> 8) & 0xff,
    config.quantity & 0xff,
  ]

  return buildFrame(request, protocol)
}

// Build a Modbus write request frame
export function buildWriteRequest(
  config: ModbusWriteConfig,
  protocol: ModbusProtocol = 'rtu'
): Uint8Array {
  let request: number[]

  if (config.functionCode === 5) {
    // Write single coil
    const value = Array.isArray(config.value) ? config.value[0] : config.value
    request = [
      config.slaveId,
      config.functionCode,
      (config.address >> 8) & 0xff,
      config.address & 0xff,
      value ? 0xff : 0x00,
      0x00,
    ]
  } else if (config.functionCode === 6) {
    // Write single register
    const value = Array.isArray(config.value) ? config.value[0] : config.value
    request = [
      config.slaveId,
      config.functionCode,
      (config.address >> 8) & 0xff,
      config.address & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ]
  } else if (config.functionCode === 15) {
    // Write multiple coils (FC15)
    if (!Array.isArray(config.value)) {
      throw new Error('FC15 requires value to be an array of bits (0/1)')
    }
    const quantity = config.value.length
    const byteCount = Math.ceil(quantity / 8)
    const coilBytes: number[] = new Array(byteCount).fill(0)
    config.value.forEach((bit, i) => {
      if (bit) {
        coilBytes[Math.floor(i / 8)] |= 1 << (i % 8)
      }
    })
    request = [
      config.slaveId,
      config.functionCode,
      (config.address >> 8) & 0xff,
      config.address & 0xff,
      (quantity >> 8) & 0xff,
      quantity & 0xff,
      byteCount,
      ...coilBytes,
    ]
  } else if (config.functionCode === 16) {
    // Write multiple registers (FC16)
    if (!Array.isArray(config.value)) {
      throw new Error('FC16 requires value to be an array of register values')
    }
    const quantity = config.value.length
    const byteCount = quantity * 2
    const registers: number[] = []
    for (const v of config.value) {
      registers.push((v >> 8) & 0xff, v & 0xff)
    }
    request = [
      config.slaveId,
      config.functionCode,
      (config.address >> 8) & 0xff,
      config.address & 0xff,
      (quantity >> 8) & 0xff,
      quantity & 0xff,
      byteCount,
      ...registers,
    ]
  } else {
    throw new Error(`Unsupported function code: ${config.functionCode}`)
  }

  return buildFrame(request, protocol)
}

// Build a complete frame with checksum for the specified protocol
function buildFrame(request: number[], protocol: ModbusProtocol): Uint8Array {
  if (protocol === 'rtu') {
    const crcValue = calculateCRC16(request)
    request.push(crcValue & 0xff, (crcValue >> 8) & 0xff)
    return new Uint8Array(request)
  } else {
    // ASCII mode: format as :AABBCC...DDLR\r\n
    const lrcValue = calculateLRC(request)
    request.push(lrcValue)

    // Convert to ASCII hex format
    const hexString = request
      .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
      .join('')

    // Create ASCII frame: : + hex data + \r\n
    const asciiFrame = `:${hexString}\r\n`
    return new Uint8Array(Array.from(asciiFrame).map((c) => c.charCodeAt(0)))
  }
}
