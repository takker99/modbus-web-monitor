// LRC (Longitudinal Redundancy Check) calculation for Modbus ASCII
// LRC = (256 - (sum of all data bytes % 256)) % 256
/**
 * LRC (Longitudinal Redundancy Check) calculation used by Modbus ASCII.
 *
 * Computes the 8-bit two's complement of the sum of the data bytes.
 *
 * @param data - Bytes to compute the LRC for
 * @returns 8-bit LRC value
 */
export function calculateLRC(data: number[]): number {
  return (256 - (data.reduce((acc, cur) => acc + cur, 0) % 256)) % 256;
}
