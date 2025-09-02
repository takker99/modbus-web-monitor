/**
 * Pure functions for building Modbus frames (RTU and ASCII).
 *
 * These helpers produce the serialized request bytes and append the
 * appropriate checksum depending on the chosen protocol.
 */

import { calculateCRC16 } from "./crc.ts";
import { calculateLRC } from "./lrc.ts";
import type { ModbusReadConfig, ModbusWriteConfig } from "./types/modbus.ts";

/**
 * Supported Modbus transport protocols used by the frame builders.
 */
export type ModbusProtocol = "rtu" | "ascii";

/**
 * Build a Modbus read request frame.
 *
 * Constructs the PDU for read requests (start address + quantity) and
 * delegates framing (checksum/ASCII conversion) to {@link buildFrame}.
 *
 * @param config - Read request configuration object.
 * @param protocol - Target transport protocol, defaults to "rtu".
 * @returns Serialized request bytes for the target protocol.
 */
export function buildReadRequest(
  config: ModbusReadConfig,
  protocol: ModbusProtocol = "rtu",
): Uint8Array {
  const request = [
    config.slaveId,
    config.functionCode,
    (config.startAddress >> 8) & 0xff,
    config.startAddress & 0xff,
    (config.quantity >> 8) & 0xff,
    config.quantity & 0xff,
  ];

  return buildFrame(request, protocol);
}

/**
 * Build a Modbus write request frame.
 *
 * Handles FC5/FC6/FC15/FC16 and validates the `config.value` shape for
 * multi-write requests.
 *
 * @param config - Write request configuration object.
 * @param protocol - Target transport protocol, defaults to "rtu".
 * @returns Serialized request bytes for the target protocol.
 * @throws Error when the request configuration is invalid for the
 *         selected function code.
 */
export function buildWriteRequest(
  config: ModbusWriteConfig,
  protocol: ModbusProtocol = "rtu",
): Uint8Array {
  let request: number[];

  switch (config.functionCode) {
    case 5: {
      const value = Array.isArray(config.value)
        ? config.value[0]
        : config.value;
      request = [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        value ? 0xff : 0x00,
        0x00,
      ];
      break;
    }
    case 6: {
      const value = Array.isArray(config.value)
        ? config.value[0]
        : config.value;
      request = [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        (value >> 8) & 0xff,
        value & 0xff,
      ];
      break;
    }
    case 15: {
      // Write multiple coils (FC15) — value must be an array of bits
      if (!Array.isArray(config.value)) {
        throw new Error("FC15 requires value to be an array of bits (0/1)");
      }
      const quantity = config.value.length;
      const byteCount = Math.ceil(quantity / 8);
      const coilBytes: number[] = new Array(byteCount).fill(0);
      config.value.forEach((bit, i) => {
        if (bit) {
          coilBytes[Math.floor(i / 8)] |= 1 << (i % 8);
        }
      });
      request = [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        (quantity >> 8) & 0xff,
        quantity & 0xff,
        byteCount,
        ...coilBytes,
      ];
      break;
    }
    case 16: {
      // Write multiple registers (FC16) — value must be an array of registers
      if (!Array.isArray(config.value)) {
        throw new Error(
          "FC16 requires value to be an array of register values",
        );
      }
      const quantity = config.value.length;
      const byteCount = quantity * 2;
      const registers: number[] = [];
      for (const v of config.value) {
        registers.push((v >> 8) & 0xff, v & 0xff);
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
      ];
      break;
    }
    default:
      throw new Error(`Unsupported function code: ${config.functionCode}`);
  }

  return buildFrame(request, protocol);
}

/**
 * Build a complete frame with checksum for the specified protocol.
 *
 * For RTU the CRC16 is appended as two bytes (low, high). For ASCII the
 * LRC is appended and the whole payload is converted to an ASCII colon
 * framed string terminated with CRLF.
 *
 * @param request - Array of bytes representing the PDU (slave + function + data).
 * @param protocol - Target transport protocol.
 * @returns The serialized frame as a Uint8Array suitable for sending.
 */
function buildFrame(request: number[], protocol: ModbusProtocol): Uint8Array {
  if (protocol === "rtu") {
    const crcValue = calculateCRC16(request);
    request.push(crcValue & 0xff, (crcValue >> 8) & 0xff);
    return new Uint8Array(request);
  }

  // ASCII mode: compute LRC and convert payload to ASCII hex with ':' prefix.
  const lrcValue = calculateLRC(request);
  request.push(lrcValue);

  const hexString = request
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join("");

  const asciiFrame = `:${hexString}\r\n`;
  return new Uint8Array(Array.from(asciiFrame).map((c) => c.charCodeAt(0)));
}
