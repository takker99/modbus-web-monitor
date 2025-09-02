import { isOk } from "option-t/plain_result";
import { describe, expect, it } from "vitest";
import { calculateCRC16 } from "../src/crc.ts";
import { parseRTUFrame, validateRTUFrame } from "../src/frameParser.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";

// Helper: append CRC
function withCRC(bytes: number[]): number[] {
  const crc = calculateCRC16(bytes);
  return [...bytes, crc & 0xff, (crc >> 8) & 0xff];
}

describe("MockTransport failure branches", () => {
  it("connect failure branch", async () => {
    const mt = new MockTransport({ type: "mock" }, { shouldFailConnect: true });
    await expect(mt.connect()).rejects.toThrow(/Mock transport error/);
  });
  it("postMessage failure branch throws", async () => {
    const mt = new MockTransport({ type: "mock" }, { shouldFailSend: true });
    await mt.connect();
    expect(() => mt.postMessage(new Uint8Array([1]))).toThrow(
      /Mock transport error/,
    );
  });
});

describe("RTU frame CRC failure branch", () => {
  it("CRC mismatch triggers error", () => {
    const good = withCRC([1, 3, 2, 0x00, 0x01]);
    const bad = [...good];
    bad[bad.length - 1] ^= 0xff; // corrupt high byte of CRC
    const result = parseRTUFrame(bad);
    expect(isOk(result)).toBe(false);
  });
});

describe("validateRTUFrame error variants", () => {
  it("too short", () => {
    const r = validateRTUFrame([1, 3, 0]);
    expect(isOk(r)).toBe(false);
  });
  it("invalid function code", () => {
    const frame = withCRC([1, 99, 0, 0]);
    const r = validateRTUFrame(frame);
    expect(isOk(r)).toBe(false);
  });
  it("incomplete frame", () => {
    // FC3 with byte count 2 requires 3+2+2=7 bytes; provide less
    const partial = [1, 3, 2, 0x00];
    const r = validateRTUFrame(partial);
    expect(isOk(r)).toBe(false);
  });
  it("crc error", () => {
    const full = withCRC([1, 6, 0x00, 0x10, 0x00, 0x01]);
    full[full.length - 2] ^= 0xaa;
    const r = validateRTUFrame(full);
    expect(isOk(r)).toBe(false);
  });
});
