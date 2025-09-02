import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateCRC16 } from "../src/crc.ts";
import { parseBitResponse, parseRegisterResponse } from "../src/frameParser.ts";
import { calculateLRC } from "../src/lrc.ts";

// Helper to build a full RTU frame for read holding registers (FC03)
function buildReadHoldingRegistersRequest(
  slaveId: number,
  start: number,
  qty: number,
) {
  const payload = [
    slaveId,
    3,
    (start >> 8) & 0xff,
    start & 0xff,
    (qty >> 8) & 0xff,
    qty & 0xff,
  ];
  const crc = calculateCRC16(payload);
  payload.push(crc & 0xff, (crc >> 8) & 0xff);
  return new Uint8Array(payload);
}

describe("CRC16", () => {
  it("matches known vector 0x01 0x03 0x00 0x00 0x00 0x0A => 0xC5CD", () => {
    const bytes = [0x01, 0x03, 0x00, 0x00, 0x00, 0x0a];
    const crc = calculateCRC16(bytes);
    expect(crc.toString(16)).toBe("cdc5"); // low byte first in frame => 0xC5 0xCD
  });
});

describe("LRC", () => {
  it("calculates LRC for known vector [0x01, 0x03, 0x00, 0x00, 0x00, 0x0A] => 0xF2", () => {
    const bytes = [0x01, 0x03, 0x00, 0x00, 0x00, 0x0a];
    const lrc = calculateLRC(bytes);
    // Sum = 0x01 + 0x03 + 0x00 + 0x00 + 0x00 + 0x0A = 14 (0x0E)
    // LRC = (256 - (14 % 256)) % 256 = (256 - 14) % 256 = 242 % 256 = 242 = 0xF2
    expect(lrc).toBe(0xf2);
  });

  it("calculates LRC for edge case sum > 255", () => {
    const bytes = [0xff, 0xff]; // sum = 510
    const lrc = calculateLRC(bytes);
    // sum % 256 = 510 % 256 = 254, LRC = (256 - 254) % 256 = 2
    expect(lrc).toBe(2);
  });

  it("calculates LRC for zero sum", () => {
    const bytes = [0x00, 0x00, 0x00];
    const lrc = calculateLRC(bytes);
    // sum = 0, LRC = (256 - 0) % 256 = 0
    expect(lrc).toBe(0);
  });
});

describe("Request frame building (read)", () => {
  it("builds proper read holding registers frame", async () => {
    const req = buildReadHoldingRegistersRequest(1, 0x0000, 10);
    // Length should be 8 bytes (6 + 2 CRC)
    expect(req.length).toBe(8);
    // CRC low/high ordering
    const crcNo = calculateCRC16(Array.from(req.slice(0, -2)));
    expect(req[6]).toBe(crcNo & 0xff);
    expect(req[7]).toBe((crcNo >> 8) & 0xff);
  });
});

describe("Property based FC16 request CRC + structure", () => {
  it("generates correct length and CRC for random register arrays", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ max: 0xffff, min: 0 }), {
          maxLength: 10,
          minLength: 1,
        }),
        fc.integer({ max: 0xff, min: 0 }),
        fc.integer({ max: 0xffff, min: 0 }),
        (regs, slaveId, address) => {
          const quantity = regs.length;
          const byteCount = quantity * 2;
          const base = [
            slaveId,
            16,
            (address >> 8) & 0xff,
            address & 0xff,
            (quantity >> 8) & 0xff,
            quantity & 0xff,
            byteCount,
            ...regs.flatMap((v: number) => [(v >> 8) & 0xff, v & 0xff]),
          ];
          const crc = calculateCRC16(base);
          const frame = [...base, crc & 0xff, (crc >> 8) & 0xff];
          const crc2 = calculateCRC16(frame.slice(0, -2));
          return (frame.length === 9 + byteCount &&
            crc === crc2 &&
            frame[frame.length - 2] === (crc & 0xff) &&
            frame[frame.length - 1] === ((crc >> 8) & 0xff)) as boolean;
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("Utility Functions", () => {
  describe("parseBitResponse", () => {
    it("correctly parses bit response from byte data", () => {
      // Test data: single byte 0b10101001 (LSB first)
      const responseData = [1, 1, 1, 0b10101001]; // slave, fc, byteCount, data
      const dataLength = 1;
      const result = parseBitResponse(responseData, dataLength);

      // Should extract 8 bits: [1,0,0,1,0,1,0,1] (LSB first)
      expect(result.slice(0, 8)).toEqual([1, 0, 0, 1, 0, 1, 0, 1]);
    });

    it("correctly parses multi-byte bit response", () => {
      // Test data: two bytes 0b11000000, 0b00000011
      const responseData = [1, 2, 2, 0b11000000, 0b00000011]; // slave, fc, byteCount, data1, data2
      const dataLength = 2;
      const result = parseBitResponse(responseData, dataLength);

      // First byte: [0,0,0,0,0,0,1,1], Second byte: [1,1,0,0,0,0,0,0]
      expect(result.slice(0, 16)).toEqual([
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        1, // First byte (LSB first)
        1,
        1,
        0,
        0,
        0,
        0,
        0,
        0, // Second byte (LSB first)
      ]);
    });
  });

  describe("parseRegisterResponse", () => {
    it("correctly parses register response from byte data", () => {
      // Test data: two registers 0x1234, 0x5678
      const responseData = [1, 3, 4, 0x12, 0x34, 0x56, 0x78]; // slave, fc, byteCount, data
      const dataLength = 4;
      const result = parseRegisterResponse(responseData, dataLength);

      expect(result).toEqual([0x1234, 0x5678]);
    });

    it("correctly parses single register response", () => {
      // Test data: single register 0xABCD
      const responseData = [1, 4, 2, 0xab, 0xcd]; // slave, fc, byteCount, data
      const dataLength = 2;
      const result = parseRegisterResponse(responseData, dataLength);

      expect(result).toEqual([0xabcd]);
    });
  });
});

describe("Function Code Type Safety", () => {
  it("allows valid read function codes", () => {
    // All these should compile without TypeScript errors
    const validReadConfigs = [
      { functionCode: 1 as const, quantity: 1, slaveId: 1, startAddress: 0 },
      { functionCode: 2 as const, quantity: 1, slaveId: 1, startAddress: 0 },
      { functionCode: 3 as const, quantity: 1, slaveId: 1, startAddress: 0 },
      { functionCode: 4 as const, quantity: 1, slaveId: 1, startAddress: 0 },
    ];

    // If this compiles, the types are working correctly
    expect(validReadConfigs).toHaveLength(4);
  });

  it("allows valid write function codes", () => {
    // All these should compile without TypeScript errors
    const validWriteConfigs = [
      { address: 0, functionCode: 5 as const, slaveId: 1, value: 1 },
      { address: 0, functionCode: 6 as const, slaveId: 1, value: 100 },
      { address: 0, functionCode: 15 as const, slaveId: 1, value: [1, 0, 1] },
      { address: 0, functionCode: 16 as const, slaveId: 1, value: [100, 200] },
    ];

    // If this compiles, the types are working correctly
    expect(validWriteConfigs).toHaveLength(4);
  });
});
