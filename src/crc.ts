/**
 * CRC-16 (Modbus) calculation utilities.
 *
 * Exports a precomputed CRC table and a small helper to compute the CRC
 * for a given buffer. The polynomial used is 0xA001 (little-endian CRC16).
 */

const CRC_TABLE = new Uint16Array(256);

for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    if ((crc & 1) !== 0) {
      crc = (crc >>> 1) ^ 0xa001;
    } else {
      crc = crc >>> 1;
    }
  }
  CRC_TABLE[i] = crc;
}

/**
 * Calculate Modbus CRC16 for a buffer.
 *
 * @param buffer - Bytes to calculate the CRC for
 * @returns The 16-bit CRC value
 */
export function calculateCRC16(buffer: Uint8Array | number[]): number {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let crc = 0xffff;
  for (const byte of buf) {
    crc = ((crc >>> 8) & 0xff) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return crc & 0xffff;
}
