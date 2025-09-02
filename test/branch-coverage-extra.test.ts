import { describe, expect, it } from "vitest";
import { calculateCRC16 } from "../src/crc.ts";
import { parseRTUFrame, validateRTUFrame } from "../src/frameParser.ts";
import { ModbusASCIIClient } from "../src/modbus-ascii.ts";
import type { ModbusReadConfig } from "../src/modbus-base.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";
import { TransportRegistry } from "../src/transport/transport.ts";

// Helper: append CRC
function withCRC(bytes: number[]): number[] {
  const crc = calculateCRC16(bytes);
  return [...bytes, crc & 0xff, (crc >> 8) & 0xff];
}

describe("TransportRegistry extra branches", () => {
  it("unknown transport type throws", () => {
    expect(() =>
      TransportRegistry.create({ type: "websocket", url: "ws://x" }),
    ).toThrow(/Unknown transport type/);
  });
});

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
    expect(result.success).toBe(false);
  });
});

describe("validateRTUFrame error variants", () => {
  it("too short", () => {
    const r = validateRTUFrame([1, 3, 0]);
    expect(r.isValid).toBe(false);
  });
  it("invalid function code", () => {
    const frame = withCRC([1, 99, 0, 0]);
    const r = validateRTUFrame(frame);
    expect(r.isValid).toBe(false);
  });
  it("incomplete frame", () => {
    // FC3 with byte count 2 requires 3+2+2=7 bytes; provide less
    const partial = [1, 3, 2, 0x00];
    const r = validateRTUFrame(partial);
    expect(r.isValid).toBe(false);
  });
  it("crc error", () => {
    const full = withCRC([1, 6, 0x00, 0x10, 0x00, 0x01]);
    full[full.length - 2] ^= 0xaa;
    const r = validateRTUFrame(full);
    expect(r.isValid).toBe(false);
  });
});

// ASCII client edge branches
describe("ModbusASCIIClient parse edge branches", () => {
  const readCfg: ModbusReadConfig = {
    functionCode: 3,
    quantity: 1,
    slaveId: 1,
    startAddress: 0,
  };
  function createClient() {
    return new ModbusASCIIClient();
  }

  it("odd hex length error", async () => {
    const c = createClient();
    const p = c.read(readCfg).catch((e) => e);
    // feed partial frame with odd length after ':'
    c.handleResponse(
      new Uint8Array(Array.from(":0103F\r\n").map((ch) => ch.charCodeAt(0))),
    );
    const err = await p;
    expect(err).toBeInstanceOf(Error);
  });

  it("invalid hex pair error", async () => {
    const c = createClient();
    const p = c.read(readCfg).catch((e) => e);
    // Provide CRLF termination to trigger processing
    c.handleResponse(
      new Uint8Array(
        Array.from(":0103ZZ\r\n".split("").map((ch) => ch.charCodeAt(0))),
      ),
    );
    const err = await p;
    expect(err).toBeInstanceOf(Error);
  });

  it("LRC mismatch", async () => {
    const c = createClient();
    const p = c.read(readCfg).catch((e) => e);
    // Valid minimal FC3 response would be :0103 02 0001 LRC . Here intentionally wrong LRC 00
    const frame = ":010302000100"; // last 00 is wrong LRC
    c.handleResponse(
      new Uint8Array(Array.from(`${frame}\r\n`).map((ch) => ch.charCodeAt(0))),
    );
    const err = await p;
    expect(err).toBeInstanceOf(Error);
  });

  it("exception frame too short", async () => {
    const c = createClient();
    const p = c.read(readCfg).catch((e) => e);
    // Exception fc (0x83) but missing exception code and LRC is forced to match structure
    const bad = ":0183"; // incomplete
    c.handleResponse(
      new Uint8Array(Array.from(`${bad}\r\n`).map((ch) => ch.charCodeAt(0))),
    );
    const err = await p;
    expect(err).toBeInstanceOf(Error);
  });

  // Internal timeout logic removed; read now relies on external AbortSignal, so no internal timeout test here.
});
