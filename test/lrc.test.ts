import { describe, expect, it } from "vitest";
import { calculateLRC } from "../src/lrc.ts";

describe("LRC Calculation", () => {
  it("calculates LRC for empty array", () => {
    expect(calculateLRC([])).toBe(0);
  });

  it("calculates LRC for single byte", () => {
    expect(calculateLRC([0x01])).toBe(0xff); // 256 - (1 % 256) = 255
  });

  it("calculates LRC for typical ASCII frame data", () => {
    // Test case: slave=1, fc=3, addr=0, qty=1
    const frame = [0x01, 0x03, 0x00, 0x00, 0x00, 0x01];
    const sum = frame.reduce((acc, byte) => acc + byte, 0); // = 5
    const expectedLRC = (256 - (sum % 256)) % 256; // = 251
    expect(calculateLRC(frame)).toBe(expectedLRC);
  });

  it("handles sum overflow correctly", () => {
    const data = [0xff, 0xff, 0xff]; // sum = 765
    expect(calculateLRC(data)).toBe(3);
  });

  it("produces different LRC for different data", () => {
    const data1 = [0x01, 0x03, 0x00, 0x00];
    const data2 = [0x01, 0x03, 0x00, 0x01];
    expect(calculateLRC(data1)).not.toBe(calculateLRC(data2));
  });
});
