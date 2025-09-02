import { describe, expect, it } from "vitest";
import { readHoldingRegisters } from "../src/api/ascii.ts";
import { ModbusExceptionError } from "../src/errors.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";

function buildAsciiFrame(bytes: number[]): string {
  const hex = bytes
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  return `:${hex}`;
}
function makeValidFC3(unit = 1, value = 0x000a) {
  const payload = [unit, 3, 2, (value >> 8) & 0xff, value & 0xff];
  const sum = payload.reduce((a, b) => (a + b) & 0xff, 0);
  const lrc = (0 - sum) & 0xff;
  return [...payload, lrc];
}
function makeExceptionFrame(unit = 1, fc = 3, code = 2) {
  const payload = [unit, fc | 0x80, code];
  const sum = payload.reduce((a, b) => (a + b) & 0xff, 0);
  const lrc = (0 - sum) & 0xff;
  return [...payload, lrc];
}

describe("ASCII additional branches", () => {
  it("mismatched function code frame ignored then aborted externally", async () => {
    const transport = new MockTransport({
      name: "ascii-extra-1",
      type: "mock",
    });
    await transport.connect();
    const ctrl = new AbortController();
    const p = readHoldingRegisters(transport, 1, 0, 1, { signal: ctrl.signal });
    const frame = makeValidFC3(1, 0x000b);
    frame[1] = 4; // mismatch
    const ascii = `${buildAsciiFrame(frame)}\r\n`;
    transport.simulateData(new TextEncoder().encode(ascii));
    ctrl.abort(new Error("Aborted"));
    const result = await p;
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/aborted/i);
  });

  it("invalid frame (bad hex) discarded, then valid frame processed", async () => {
    const transport = new MockTransport({
      name: "ascii-extra-2",
      type: "mock",
    });
    await transport.connect();
    const p = readHoldingRegisters(transport, 1, 0, 1);
    const good = makeValidFC3();
    // Create a frame with an invalid hex digit (replace one byte's hex with 'GG')
    const validAscii = `${buildAsciiFrame(good)}\r\n`;
    const corrupted = validAscii.replace(
      /:[0-9A-F]{2}/,
      (m) => `${m.slice(0, 1)}GG`,
    );
    transport.simulateData(new TextEncoder().encode(corrupted));
    transport.simulateData(new TextEncoder().encode(validAscii));
    const res = await p;
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.data[0]).toBe(0x000a);
  });

  it("exception frame produces ModbusExceptionError", async () => {
    const transport = new MockTransport({
      name: "ascii-extra-3",
      type: "mock",
    });
    await transport.connect();
    const p = readHoldingRegisters(transport, 1, 0, 1);
    const exc = makeExceptionFrame(1, 3, 2);
    transport.simulateData(
      new TextEncoder().encode(`${buildAsciiFrame(exc)}\r\n`),
    );
    const res = await p;
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBeInstanceOf(ModbusExceptionError);
  });

  it("error event propagates as error result", async () => {
    const transport = new MockTransport({
      name: "ascii-extra-4",
      type: "mock",
    });
    await transport.connect();
    const p = readHoldingRegisters(transport, 1, 0, 1);
    transport.simulateError(new Error("Boom"));
    const res = await p;
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toBe("Boom");
  });

  it("skips unmatched frame then processes matching frame", async () => {
    const transport = new MockTransport({
      name: "ascii-extra-5",
      type: "mock",
    });
    await transport.connect();
    const p = readHoldingRegisters(transport, 1, 0, 1);
    const unmatched = makeValidFC3(1, 0x0022);
    unmatched[1] = 4; // change function to FC4 (mismatch)
    const matched = makeValidFC3(1, 0x0033);
    transport.simulateData(
      new TextEncoder().encode(
        `${buildAsciiFrame(unmatched)}\r\n${buildAsciiFrame(matched)}\r\n`,
      ),
    );
    const res = await p;
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.data[0]).toBe(0x0033);
  });
});
