import { describe, expect, it } from "vitest";
import {
  findFrameResyncPosition,
  isPlausibleFrameStart,
} from "../src/frameParser.ts";

describe("Buffer Resynchronization", () => {
  describe("isPlausibleFrameStart", () => {
    it("recognizes valid slave IDs (1-247)", () => {
      expect(isPlausibleFrameStart([1, 3], 0)).toBe(true);
      expect(isPlausibleFrameStart([247, 3], 0)).toBe(true);
      expect(isPlausibleFrameStart([0, 3], 0)).toBe(false); // Invalid slave ID
      expect(isPlausibleFrameStart([248, 3], 0)).toBe(false); // Invalid slave ID
    });

    it("recognizes valid function codes", () => {
      expect(isPlausibleFrameStart([1, 1], 0)).toBe(true); // FC01
      expect(isPlausibleFrameStart([1, 2], 0)).toBe(true); // FC02
      expect(isPlausibleFrameStart([1, 3], 0)).toBe(true); // FC03
      expect(isPlausibleFrameStart([1, 4], 0)).toBe(true); // FC04
      expect(isPlausibleFrameStart([1, 5], 0)).toBe(true); // FC05
      expect(isPlausibleFrameStart([1, 6], 0)).toBe(true); // FC06
      expect(isPlausibleFrameStart([1, 15], 0)).toBe(true); // FC15
      expect(isPlausibleFrameStart([1, 16], 0)).toBe(true); // FC16
      expect(isPlausibleFrameStart([1, 7], 0)).toBe(false); // Invalid function code
    });

    it("recognizes valid exception frames", () => {
      expect(isPlausibleFrameStart([1, 0x81], 0)).toBe(true); // Exception FC01
      expect(isPlausibleFrameStart([1, 0x83], 0)).toBe(true); // Exception FC03
      expect(isPlausibleFrameStart([1, 0x86], 0)).toBe(true); // Exception FC06
      expect(isPlausibleFrameStart([1, 0x8f], 0)).toBe(true); // Exception FC15
      expect(isPlausibleFrameStart([1, 0x90], 0)).toBe(true); // Exception FC16
      expect(isPlausibleFrameStart([1, 0x87], 0)).toBe(false); // Invalid exception
    });

    it("handles buffer boundary conditions", () => {
      expect(isPlausibleFrameStart([1], 0)).toBe(false); // Missing function code
      expect(isPlausibleFrameStart([1, 3], 1)).toBe(false); // Index out of bounds
      expect(isPlausibleFrameStart([], 0)).toBe(false); // Empty buffer
    });
  });

  describe("findFrameResyncPosition", () => {
    it("finds valid frame start after corrupted data", () => {
      const buffer = [
        0xff,
        0xff,
        0x00, // Noise/corruption
        0x01,
        0x03,
        0x02,
        0x00,
        0x0a, // Valid frame start
      ];
      expect(findFrameResyncPosition(buffer)).toBe(3);
    });

    it("returns -1 when no valid frame start found", () => {
      const buffer = [0xff, 0xff, 0x00, 0x00, 0xff];
      expect(findFrameResyncPosition(buffer)).toBe(-1);
    });

    it("skips first position (current corrupted frame)", () => {
      const buffer = [
        0x01,
        0x03, // Valid but should be skipped (position 0)
        0xff,
        0xff, // Noise
        0x02,
        0x04, // Valid frame start at position 4
      ];
      expect(findFrameResyncPosition(buffer)).toBe(4);
    });

    it("finds exception frame starts", () => {
      const buffer = [
        0xff,
        0x00, // Noise
        0x01,
        0x83, // Exception frame start
        0x02, // Error code
      ];
      expect(findFrameResyncPosition(buffer)).toBe(2);
    });

    it("handles empty and small buffers", () => {
      expect(findFrameResyncPosition([])).toBe(-1);
      expect(findFrameResyncPosition([1])).toBe(-1);
      expect(findFrameResyncPosition([1, 3])).toBe(-1); // Too small to scan
    });
  });

  describe("Performance and Edge Cases", () => {
    it("handles large buffers efficiently", () => {
      // Create a large buffer with valid frame at the end
      const largeBuffer = new Array(1000).fill(0xff); // 1000 bytes of noise
      largeBuffer.push(1, 3, 2, 0, 50); // Valid frame at end

      const position = findFrameResyncPosition(largeBuffer);
      expect(position).toBe(1000); // Should find the valid frame
    });

    it("handles buffer with only partial frame at end", () => {
      const buffer = [0xff, 0xff, 1]; // Ends with partial valid frame
      expect(findFrameResyncPosition(buffer)).toBe(-1); // Should not find incomplete frame
    });
  });
});
