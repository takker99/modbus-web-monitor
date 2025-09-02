import { describe, expect, it } from "vitest";
import {
  toASCIIFrame,
  toReadPDU,
  toRTUFrame,
  toWritePDU,
} from "../src/frameBuilder.ts";
import type { ReadRequest, WriteRequest } from "../src/modbus.ts";

describe("Frame Builder", () => {
  describe("toReadPDU + framing", () => {
    it("builds RTU read request correctly", () => {
      const config: ReadRequest = {
        address: 0x0000,
        functionCode: 3,
        quantity: 10,
        slaveId: 1,
      };
      const frame = toRTUFrame(toReadPDU(config));

      // Expected: [0x01, 0x03, 0x00, 0x00, 0x00, 0x0A, CRC_LO, CRC_HI]
      expect(frame.length).toBe(8);
      expect(frame[0]).toBe(1); // slave ID
      expect(frame[1]).toBe(3); // function code
      expect(frame[2]).toBe(0); // start address high
      expect(frame[3]).toBe(0); // start address low
      expect(frame[4]).toBe(0); // quantity high
      expect(frame[5]).toBe(10); // quantity low
      // CRC would be calculated and appended
    });

    it("builds ASCII read request correctly", () => {
      const config: ReadRequest = {
        address: 0x0000,
        functionCode: 3,
        quantity: 10,
        slaveId: 1,
      };
      const frame = toASCIIFrame(toReadPDU(config));
      const frameString = String.fromCharCode(...frame);

      expect(frameString.startsWith(":")).toBe(true);
      expect(frameString.endsWith("\r\n")).toBe(true);
      expect(frameString).toContain("01030000000A"); // hex data
    });
  });

  describe("toWritePDU + framing", () => {
    it("builds single coil write request (FC05)", () => {
      const config: WriteRequest = {
        address: 0x0013,
        functionCode: 5,
        slaveId: 1,
        value: 1,
      };
      const frame = toRTUFrame(toWritePDU(config));

      expect(frame.length).toBe(8);
      expect(frame[0]).toBe(1); // slave ID
      expect(frame[1]).toBe(5); // function code
      expect(frame[2]).toBe(0); // address high
      expect(frame[3]).toBe(0x13); // address low
      expect(frame[4]).toBe(0xff); // value high (ON = 0xFF00)
      expect(frame[5]).toBe(0x00); // value low
    });

    it("builds single register write request (FC06)", () => {
      const config: WriteRequest = {
        address: 0x0001,
        functionCode: 6,
        slaveId: 1,
        value: 0x1234,
      };
      const frame = toRTUFrame(toWritePDU(config));

      expect(frame.length).toBe(8);
      expect(frame[0]).toBe(1); // slave ID
      expect(frame[1]).toBe(6); // function code
      expect(frame[2]).toBe(0); // address high
      expect(frame[3]).toBe(1); // address low
      expect(frame[4]).toBe(0x12); // value high
      expect(frame[5]).toBe(0x34); // value low
    });

    it("builds multiple coils write request (FC15)", () => {
      const config: WriteRequest = {
        address: 0x0013,
        functionCode: 15,
        slaveId: 1,
        value: [1, 0, 1, 1, 0, 1, 0, 0, 1], // 9 bits = 2 bytes
      };
      const frame = toRTUFrame(toWritePDU(config));

      expect(frame.length).toBe(11); // slave + fc + addr(2) + qty(2) + byteCount + data(2) + crc(2)
      expect(frame[0]).toBe(1); // slave ID
      expect(frame[1]).toBe(15); // function code
      expect(frame[2]).toBe(0x00); // address high
      expect(frame[3]).toBe(0x13); // address low
      expect(frame[4]).toBe(0x00); // quantity high
      expect(frame[5]).toBe(0x09); // quantity low (9 coils)
      expect(frame[6]).toBe(2); // byte count (2 bytes for 9 bits)
      // Bit packing: [1,0,1,1,0,1,0,0] = 0x2D, [1] = 0x01
      expect(frame[7]).toBe(0x2d); // first byte
      expect(frame[8]).toBe(0x01); // second byte
    });

    it("builds multiple registers write request (FC16)", () => {
      const config: WriteRequest = {
        address: 0x0001,
        functionCode: 16,
        slaveId: 1,
        value: [0x1234, 0x5678],
      };
      const frame = toRTUFrame(toWritePDU(config));

      expect(frame.length).toBe(13); // slave + fc + addr(2) + qty(2) + byteCount + data(4) + crc(2)
      expect(frame[0]).toBe(1); // slave ID
      expect(frame[1]).toBe(16); // function code
      expect(frame[2]).toBe(0x00); // address high
      expect(frame[3]).toBe(0x01); // address low
      expect(frame[4]).toBe(0x00); // quantity high
      expect(frame[5]).toBe(0x02); // quantity low (2 registers)
      expect(frame[6]).toBe(4); // byte count (2 registers * 2 bytes)
      expect(frame[7]).toBe(0x12); // first register high
      expect(frame[8]).toBe(0x34); // first register low
      expect(frame[9]).toBe(0x56); // second register high
      expect(frame[10]).toBe(0x78); // second register low
    });

    it("throws error for unsupported function code", () => {
      const config = {
        address: 0,
        // biome-ignore lint/suspicious/noExplicitAny: For test case
        functionCode: 99 as any,
        slaveId: 1,
        value: 0,
      };
      // biome-ignore lint/suspicious/noExplicitAny: intentional for unsupported function code test
      expect(() => toWritePDU(config as any)).toThrow(
        "Unsupported function code: 99",
      );
    });
  });
});
