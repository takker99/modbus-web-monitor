// LRC (Longitudinal Redundancy Check) calculation for Modbus ASCII
// LRC = (256 - (sum of all data bytes % 256)) % 256
export function calculateLRC(data: number[]): number {
  let lrc = 0
  for (const byte of data) {
    lrc += byte
  }
  return (256 - (lrc % 256)) % 256
}
