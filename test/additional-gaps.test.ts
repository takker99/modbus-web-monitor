import { isOk } from "option-t/plain_result";
import { describe, expect, it } from "vitest";
import { calculateCRC16 } from "../src/crc.ts";
import {
  getExpectedResponseLength,
  parseRTUFrame,
  validateASCIIFrame,
  validateRTUFrame,
} from "../src/frameParser.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";
import { TransportRegistry } from "../src/transport/transport.ts";

// Utility to append CRC to a payload (without CRC)
function withCRC(bytes: number[]): number[] {
  const crc = calculateCRC16(bytes);
  return [...bytes, crc & 0xff, (crc >> 8) & 0xff];
}

describe("MockTransport uncovered branches", () => {
  it("connect no-op when already connected", async () => {
    const mt = new MockTransport({ type: "mock" });
    await mt.connect();
    await mt.connect(); // second should early return
    expect(mt.connected).toBe(true);
  });

  it("disconnect no-op when already disconnected", async () => {
    const mt = new MockTransport({ type: "mock" });
    await mt.disconnect(); // no throw
    expect(mt.connected).toBe(false);
  });

  it("postMessage before connect throws", () => {
    const mt = new MockTransport({ type: "mock" });
    expect(() => mt.postMessage(new Uint8Array([1, 2, 3]))).toThrow(
      /not connected/,
    );
  });

  it("autoResponses path emits message event", async () => {
    const mt = new MockTransport({ type: "mock" });
    const req = new Uint8Array([0x01, 0x03, 0x00]);
    const res = new Uint8Array([0x11, 0x22]);
    mt.setAutoResponse(req, res);
    const received: Uint8Array[] = [];
    mt.addEventListener("message", (e) =>
      received.push((e as CustomEvent<Uint8Array>).detail),
    );
    await mt.connect();
    mt.postMessage(req);
    await new Promise((r) => setTimeout(r, 5));
    expect(received.length).toBe(1);
    expect(Array.from(received[0])).toEqual([0x11, 0x22]);
  });
});

describe("TransportRegistry invalid type branches", () => {
  it("mock factory rejects wrong type", () => {
    // 'mock' 登録ファクトリに 'serial' を与えてミスマッチエラーを誘発
    expect(() =>
      TransportRegistry.create({
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        type: "serial",
      }),
    ).toThrow();
  });
});

describe("frameParser extra negative branches", () => {
  it("parseRTUFrame unknown function code", () => {
    const buf = withCRC([1, 99, 0x00, 0x00]); // will be length 6 but function 99 triggers unknown
    const result = parseRTUFrame(buf);
    expect(isOk(result)).toBe(false);
  });

  it("validateRTUFrame invalid function code", () => {
    const buf = withCRC([1, 99, 0, 0]);
    const res = validateRTUFrame(buf);
    expect(isOk(res)).toBe(false);
  });

  it("validateASCIIFrame invalid format", () => {
    const res = validateASCIIFrame("XX0102");
    expect(isOk(res)).toBe(false);
  });

  it("getExpectedResponseLength exception", () => {
    const len = getExpectedResponseLength([1, 0x83]);
    expect(len).toBe(5);
  });
});
