import { describe, expect, it, vi } from "vitest";
import { ModbusExceptionError } from "../src/errors.ts";
import { buildWriteRequest } from "../src/frameBuilder.ts";
import type { ModbusWriteConfig } from "../src/modbus.ts";
import { SerialManager } from "../src/serial.ts";

// Helper to build a minimal write config
function writeCfg(overrides: Partial<ModbusWriteConfig>): ModbusWriteConfig {
  return {
    address: 0x0000,
    functionCode: 5,
    slaveId: 1,
    value: 1,
    ...overrides,
  } as ModbusWriteConfig;
}

describe("errors.ts additional branches", () => {
  it("ModbusExceptionError unknown exception code uses fallback message", () => {
    const err = new ModbusExceptionError(0x7f); // not in map
    expect(err.message).toMatch(/Unknown exception 127/);
  });
});

describe("frameBuilder write error branches", () => {
  it("FC15 requires array", () => {
    const cfg = writeCfg({ functionCode: 15, value: 1 });
    expect(() => buildWriteRequest(cfg)).toThrow(/FC15 requires value/);
  });

  it("FC16 requires array", () => {
    const cfg = writeCfg({ address: 0x10, functionCode: 16, value: 1 });
    expect(() => buildWriteRequest(cfg)).toThrow(/FC16 requires value/);
  });

  it("unsupported function code throws", () => {
    const cfg = writeCfg({ functionCode: 99 as unknown as 5 });
    expect(() => buildWriteRequest(cfg)).toThrow(/Unsupported function code/);
  });
});

class FakeSerialPort {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  async open(): Promise<void> {}
  async close(): Promise<void> {}
}

type RequestPortFn = () => Promise<unknown>;
function setNavigatorSerial(requestPortImpl: RequestPortFn) {
  (
    globalThis as unknown as {
      navigator: { serial: { requestPort: RequestPortFn } };
    }
  ).navigator = {
    serial: { requestPort: requestPortImpl },
  };
}

describe("SerialManager negative paths", () => {
  it("connect without selecting port", async () => {
    const sm = new SerialManager();
    await expect(
      sm.connect({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 }),
    ).rejects.toThrow(/No port selected/);
  });

  it("send without writer", async () => {
    const sm = new SerialManager();
    await expect(sm.send(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      /Serial port not open/,
    );
  });

  it("reconnect without port selected", async () => {
    const sm = new SerialManager();
    await expect(
      sm.reconnect({
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      }),
    ).rejects.toThrow(/No port available/);
  });

  it("selectPort failure propagates", async () => {
    const sm = new SerialManager();
    const requestPort = vi.fn().mockRejectedValue(new Error("denied"));
    setNavigatorSerial(requestPort);
    await expect(sm.selectPort()).rejects.toThrow(/Failed to select port/);
    expect(requestPort).toHaveBeenCalled();
  });

  it("EventEmitter off removes listener", () => {
    const sm = new SerialManager();
    const fn = vi.fn();
    sm.on("connected", fn);
    sm.off("connected", fn);
    (sm as unknown as { emit: (e: string) => void }).emit("connected");
    expect(fn).not.toHaveBeenCalled();
  });

  it("connect already connected throws", async () => {
    const sm = new SerialManager();
    const fake = new FakeSerialPort() as unknown as SerialPort & {
      readable: ReadableStream<Uint8Array> | null;
      writable: WritableStream<Uint8Array> | null;
    };
    (fake as { readable: ReadableStream<Uint8Array> | null }).readable =
      new ReadableStream<Uint8Array>({
        start(c) {
          c.close();
        },
      });
    (fake as { writable: WritableStream<Uint8Array> | null }).writable =
      new WritableStream<Uint8Array>({
        write() {
          /* no-op */
        },
      });
    const rp = vi.fn().mockResolvedValue(fake);
    setNavigatorSerial(rp);
    await sm.selectPort();
    await sm.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
    });
    // Force internal state for guard branch (simulate already connected)
    (sm as unknown as { isConnected: boolean }).isConnected = true;
    await expect(
      sm.connect({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 }),
    ).rejects.toThrow(/Already connected/);
  });
});

import { readHoldingRegisters as readHoldingRegistersRTU } from "../src/api/rtu.ts";
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
    const asciiModule = await import("../src/api/ascii.ts");
    const asciiResult = await asciiModule.readHoldingRegisters(
      transport,
      1,
      0,
      1,
      { signal: c.signal },
    );
    expect(rtuResult.success).toBe(false);
    expect(asciiResult.success).toBe(false);
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
