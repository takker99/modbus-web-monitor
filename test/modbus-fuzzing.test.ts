import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateCRC16 } from "../src/crc.ts";
import { calculateLRC } from "../src/lrc.ts";

describe("Frame Fuzzing Tests", () => {
  describe("RTU Frame Generation and Validation", () => {
    it("generates valid RTU frames for all supported function codes", () => {
      fc.assert(
        fc.property(
          fc.integer({ max: 247, min: 1 }), // Slave ID
          fc.constantFrom(1, 2, 3, 4, 5, 6, 15, 16), // Function codes
          fc.integer({ max: 65535, min: 0 }), // Address
          fc.integer({ max: 125, min: 1 }), // Quantity/Value
          (slaveId, functionCode, address, quantity) => {
            // Build request frame based on function code
            let frame: number[];

            if ([1, 2, 3, 4].includes(functionCode)) {
              // Read functions
              frame = [
                slaveId,
                functionCode,
                (address >> 8) & 0xff,
                address & 0xff,
                (quantity >> 8) & 0xff,
                quantity & 0xff,
              ];
            } else if ([5, 6].includes(functionCode)) {
              // Single write functions
              const value =
                functionCode === 5
                  ? quantity % 2
                    ? 0xff00
                    : 0x0000
                  : quantity;
              frame = [
                slaveId,
                functionCode,
                (address >> 8) & 0xff,
                address & 0xff,
                (value >> 8) & 0xff,
                value & 0xff,
              ];
            } else {
              // Multi-write functions (15, 16) - simplified
              const byteCount =
                functionCode === 15 ? Math.ceil(quantity / 8) : quantity * 2;
              frame = [
                slaveId,
                functionCode,
                (address >> 8) & 0xff,
                address & 0xff,
                (quantity >> 8) & 0xff,
                quantity & 0xff,
                byteCount,
                ...Array(byteCount).fill(0),
              ];
            }

            // Add CRC
            const crc = calculateCRC16(frame);
            frame.push(crc & 0xff, (crc >> 8) & 0xff);

            // Validate frame structure
            expect(frame.length).toBeGreaterThanOrEqual(8);
            expect(frame[0]).toBe(slaveId);
            expect(frame[1]).toBe(functionCode);

            // Validate CRC
            const calculatedCRC = calculateCRC16(frame.slice(0, -2));
            const frameCRC =
              (frame[frame.length - 1] << 8) | frame[frame.length - 2];
            expect(calculatedCRC).toBe(frameCRC);

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("ASCII Frame Generation and Validation", () => {
    it("generates valid ASCII frames with proper LRC", () => {
      fc.assert(
        fc.property(
          fc.integer({ max: 247, min: 1 }),
          fc.constantFrom(3, 6),
          fc.integer({ max: 65535, min: 0 }),
          fc.integer({ max: 100, min: 1 }),
          (slaveId, functionCode, address, value) => {
            const frame = [
              slaveId,
              functionCode,
              (address >> 8) & 0xff,
              address & 0xff,
              (value >> 8) & 0xff,
              value & 0xff,
            ];

            // Calculate LRC and build ASCII frame
            const lrc = calculateLRC(frame);
            frame.push(lrc);

            // Convert to ASCII hex format
            const hexString = frame
              .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
              .join("");

            const asciiFrame = `:${hexString}\r\n`;

            // Validate structure
            expect(asciiFrame[0]).toBe(":");
            expect(asciiFrame.endsWith("\r\n")).toBe(true);
            expect((asciiFrame.length - 3) % 2).toBe(0); // Even number of hex chars

            // Validate LRC calculation
            const calculatedLRC = calculateLRC(frame.slice(0, -1));
            expect(calculatedLRC).toBe(lrc);

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
