/**
 * Pure functions for building Modbus frames (RTU and ASCII).
 *
 * These helpers produce the serialized request bytes and append the
 * appropriate checksum depending on the chosen protocol.
 */

import { calculateCRC16 } from "./crc.ts";
import { calculateLRC } from "./lrc.ts";
import type { ReadRequest, WriteRequest } from "./modbus.ts";

/**
 * Supported Modbus transport protocols used by the frame builders.
 */
export type ModbusProtocol = "rtu" | "ascii";

/**
 * Convert a high-level read request into a raw Modbus PDU (no checksum / no ASCII framing).
 * Layout: [ slaveId, functionCode, addressHi, addressLo, quantityHi, quantityLo ]
 * @remarks Returned array is a fresh copy and can be safely mutated by the caller if needed.
 */
export function toReadPDU(config: ReadRequest): number[] {
  return [
    config.slaveId,
    config.functionCode,
    (config.address >> 8) & 0xff,
    config.address & 0xff,
    (config.quantity >> 8) & 0xff,
    config.quantity & 0xff,
  ];
}

/**
 * Convert a high-level write request (FC5/6/15/16) into a raw Modbus PDU (no checksum / no ASCII framing).
 * @throws Error if the provided value shape is invalid for the given function code.
 */
export function toWritePDU(config: WriteRequest): number[] {
  switch (config.functionCode) {
    case 5: {
      const value = Array.isArray(config.value)
        ? config.value[0]
        : config.value;
      return [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        value ? 0xff : 0x00,
        0x00,
      ];
    }
    case 6: {
      const value = Array.isArray(config.value)
        ? config.value[0]
        : config.value;
      return [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        (value >> 8) & 0xff,
        value & 0xff,
      ];
    }
    case 15: {
      if (!Array.isArray(config.value)) {
        throw new Error("FC15 requires value to be an array of bits (0/1)");
      }
      const quantity = config.value.length;
      const byteCount = Math.ceil(quantity / 8);
      const coilBytes: number[] = new Array(byteCount).fill(0);
      config.value.forEach((bit, i) => {
        if (bit) coilBytes[Math.floor(i / 8)] |= 1 << (i % 8);
      });
      return [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        (quantity >> 8) & 0xff,
        quantity & 0xff,
        byteCount,
        ...coilBytes,
      ];
    }
    case 16: {
      if (!Array.isArray(config.value)) {
        throw new Error(
          "FC16 requires value to be an array of register values",
        );
      }
      const quantity = config.value.length;
      const registers: number[] = [];
      for (const v of config.value) registers.push((v >> 8) & 0xff, v & 0xff);
      const byteCount = quantity * 2;
      return [
        config.slaveId,
        config.functionCode,
        (config.address >> 8) & 0xff,
        config.address & 0xff,
        (quantity >> 8) & 0xff,
        quantity & 0xff,
        byteCount,
        ...registers,
      ];
    }
    default:
      throw new Error(`Unsupported function code: ${config.functionCode}`);
  }
}

/**
 * Wrap a PDU into an RTU ADU (append CRC16 low/high). Input array is not mutated.
 */
export function toRTUFrame(pdu: number[]): Uint8Array {
  const payload = [...pdu];
  const crcValue = calculateCRC16(payload);
  payload.push(crcValue & 0xff, (crcValue >> 8) & 0xff);
  return new Uint8Array(payload);
}

/**
 * Wrap a PDU into an ASCII frame (: .. LRC CRLF). Input array is not mutated.
 */
export function toASCIIFrame(pdu: number[]): Uint8Array {
  const payload = [...pdu];
  const lrcValue = calculateLRC(payload);
  payload.push(lrcValue);
  const hexString = payload
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  const asciiFrame = `:${hexString}\r\n`;
  return new Uint8Array(Array.from(asciiFrame).map((c) => c.charCodeAt(0)));
}

// 旧 build* API は完全に削除されました。必要なら git 履歴を参照してください。
