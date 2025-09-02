import { describe, expect, it } from "vitest";
import { ModbusExceptionError } from "../src/errors.ts";
import { toWritePDU } from "../src/frameBuilder.ts";
import type { WriteRequest } from "../src/modbus.ts";

// Helper to build a minimal write config
function writeCfg(overrides: Partial<WriteRequest>): WriteRequest {
  return {
    address: 0x0000,
    functionCode: 5,
    slaveId: 1,
    value: 1,
    ...overrides,
  };
}

describe("errors.ts additional branches", () => {
  it("ModbusExceptionError unknown exception code uses fallback message", () => {
    // biome-ignore lint/suspicious/noExplicitAny: For test case
    const err = new ModbusExceptionError(0x7f as any); // not in map
    expect(err.message).toMatch(/Unknown exception 127/);
  });
});

describe("frameBuilder write error branches", () => {
  it("FC15 requires array", () => {
    const cfg = writeCfg({ functionCode: 15, value: 1 });
    // biome-ignore lint/suspicious/noExplicitAny: intentional for invalid input test
    expect(() => toWritePDU(cfg as any)).toThrow(/FC15 requires value/);
  });

  it("FC16 requires array", () => {
    const cfg = writeCfg({ address: 0x10, functionCode: 16, value: 1 });
    // biome-ignore lint/suspicious/noExplicitAny: intentional for invalid input test
    expect(() => toWritePDU(cfg as any)).toThrow(/FC16 requires value/);
  });

  it("unsupported function code throws", () => {
    const cfg = writeCfg({ functionCode: 99 as unknown as 5 });
    // biome-ignore lint/suspicious/noExplicitAny: intentional for invalid input test
    expect(() => toWritePDU(cfg as any)).toThrow(/Unsupported function code/);
  });
});

import { isOk } from "option-t/plain_result";
import { readHoldingRegisters } from "../src/ascii.ts";
import { readHoldingRegisters as readHoldingRegistersRTU } from "../src/rtu.ts";
// Extra abort pre-check coverage for pure function APIs
import { MockTransport } from "../src/transport/mock-transport.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("Abort pre-check coverage", () => {
  it("aborted signal before send returns aborted error (rtu & ascii)", async () => {
    const transport = new MockTransport({ name: "extra", type: "mock" });
    await transport.connect();
    const c = new AbortController();
    c.abort(new Error("Aborted"));
    const rtuResult = await readHoldingRegistersRTU(transport, 1, 0, 1, {
      signal: c.signal,
    });
    const asciiResult = await readHoldingRegisters(transport, 1, 0, 1, {
      signal: c.signal,
    });
    expect(isOk(rtuResult)).toBe(false);
    expect(isOk(asciiResult)).toBe(false);
  });
});
