// LRC (Longitudinal Redundancy Check) calculation for Modbus ASCII
// LRC = (256 - (sum of all data bytes % 256)) % 256
export function calculateLRC(data: number[]): number {
  return (256 - (data.reduce((acc, cur) => acc + cur, 0) % 256)) % 256;
}
