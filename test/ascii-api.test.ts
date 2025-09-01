import { beforeEach, describe, expect, it } from "vitest";
import * as ascii from "../src/api/ascii.ts";
import { ModbusExceptionError } from "../src/errors.ts";
import { buildReadRequest, buildWriteRequest } from "../src/frameBuilder.ts";
import { calculateLRC } from "../src/lrc.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";

// Helper to hex-stringify bytes for debugging
function toAsciiFrame(payload: number[]): Uint8Array {
  // append LRC
  const lrc = calculateLRC(payload);
  const full = [...payload, lrc];
  const hex = full
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  const str = `:${hex}\r\n`;
  return new TextEncoder().encode(str);
}

function makeTransport(): MockTransport {
  // Mock transport requires only type: 'mock'
  return new MockTransport({ type: "mock" });
}

describe("ASCII API full coverage", () => {
  let transport: MockTransport;
  beforeEach(async () => {
    transport = makeTransport();
    await transport.connect();
  });

  it("readHoldingRegisters success", async () => {
    buildReadRequest(
      { functionCode: 3, quantity: 2, slaveId: 1, startAddress: 0x0002 },
      "ascii",
    );
    // Response: slave 1, fc3, byteCount 4, registers 0x0011 0x2233
    const payload = [1, 3, 4, 0x00, 0x11, 0x22, 0x33];
    // Emit response manually because ASCII validation discards byteCount
    setTimeout(() => transport.simulateData(toAsciiFrame(payload)), 1);
    const res = await ascii.readHoldingRegisters(transport, 1, 0x0002, 2);
    if (!res.success) throw res.error;
    expect(res.data.data).toEqual([0x0011, 0x2233]);
  });

  it("readCoils success (bits)", async () => {
    buildReadRequest(
      { functionCode: 1, quantity: 10, slaveId: 1, startAddress: 0x0000 },
      "ascii",
    );
    // byteCount = 2 (at least to hold 10 bits). Provide pattern 0b1010_1100, 0b00000011
    const payload = [1, 1, 2, 0b11001010, 0b00000011];
    setTimeout(() => transport.simulateData(toAsciiFrame(payload)), 1);
    const res = await ascii.readCoils(transport, 1, 0x0000, 10);
    if (!res.success) throw res.error;
    // parseBitResponse pushes bits LSB-first of each byte
    // First byte 0b11001010 -> bits (LSB->) 0,1,0,1,0,0,1,1
    // Second byte 0b00000011 -> 1,1,0,0,0,0,0,0 ... we only care first two to reach 10 total bits
    expect(res.data.data.slice(0, 10)).toEqual([0, 1, 0, 1, 0, 0, 1, 1, 1, 1]);
  });

  it("writeSingleRegister success", async () => {
    buildWriteRequest(
      { address: 0x0020, functionCode: 6, slaveId: 1, value: 0x1234 },
      "ascii",
    );
    // Echo style response for FC06: slave, fc, addr hi, addr lo, value hi, value lo
    const payload = [1, 6, 0x00, 0x20, 0x12, 0x34];
    setTimeout(() => transport.simulateData(toAsciiFrame(payload)), 1);
    const res = await ascii.writeSingleRegister(transport, 1, 0x0020, 0x1234);
    if (!res.success) throw res.error;
  });

  it("writeMultipleRegisters success", async () => {
    buildWriteRequest(
      {
        address: 0x0100,
        functionCode: 16,
        slaveId: 1,
        value: [0x1111, 0x2222],
      },
      "ascii",
    );
    // Response: slave, fc, addr hi, addr lo, qty hi, qty lo
    const payload = [1, 16, 0x01, 0x00, 0x00, 0x02];
    setTimeout(() => transport.simulateData(toAsciiFrame(payload)), 1);
    const res = await ascii.writeMultipleRegisters(
      transport,
      1,
      0x0100,
      [0x1111, 0x2222],
    );
    if (!res.success) throw res.error;
  });

  it("exception frame", async () => {
    buildReadRequest(
      { functionCode: 3, quantity: 1, slaveId: 1, startAddress: 0x0000 },
      "ascii",
    );
    // Exception: functionCode | 0x80, exception code 2 (Illegal Data Address). Payload: slave, fc|0x80, exCode
    const payload = [1, 3 | 0x80, 2];
    setTimeout(() => transport.simulateData(toAsciiFrame(payload)), 1);
    const res = await ascii.readHoldingRegisters(transport, 1, 0x0000, 1);
    expect(res.success).toBe(false);
    if (res.success) return; // TS narrow guard
    expect(res.error).toBeInstanceOf(ModbusExceptionError);
  });

  it("timeout", async () => {
    // No auto response set -> expect timeout
    const res = await ascii.readInputRegisters(transport, 1, 0x0000, 1, {
      timeout: 30,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.message).toMatch(/timeout/i);
    }
  });
});
