/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { useSerial } from "../src/frontend/hooks/useSerial.ts";
import { MockSerialPort } from "./mock-serial-port.ts";
import { act, renderHook } from "./vitest-render-hook.ts";

// Patch the open/close with spies for assertions if needed
// (Original mock provides open/close; we wrap to spy in individual tests when necessary.)

describe("useSerial", () => {
  const cfg: SerialOptions = {
    baudRate: 9600,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
  };

  it("initial state has no transport", () => {
    const { result } = renderHook(() =>
      useSerial(cfg, {
        requestPort: async () => new MockSerialPort(),
      }),
    );
    expect(result.current.transport).toBeUndefined();
  });

  it("selectPort sets transport", async () => {
    const mockPort = new MockSerialPort();
    const { result } = renderHook(() =>
      useSerial(cfg, {
        requestPort: async () => mockPort,
      }),
    );
    await act(async () => {
      await result.current.selectPort();
    });
    expect(result.current.transport).toBeDefined();
    expect(result.current.transport?.connected).toBe(false); // connect not called yet
  });

  it("subsequent selectPort disposes previous transport", async () => {
    const first = new MockSerialPort();
    const second = new MockSerialPort();
    const req = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { result } = renderHook(() => useSerial(cfg, { requestPort: req }));
    await act(async () => {
      await result.current.selectPort();
    });
    const t1 = result.current.transport;
    await act(async () => {
      await result.current.selectPort();
    });
    const t2 = result.current.transport;
    expect(t1).not.toBe(t2);
  });

  it("propagates requestPort rejection", async () => {
    const err = new Error("denied");
    const { result } = renderHook(() =>
      useSerial(cfg, {
        requestPort: async () => {
          throw err;
        },
      }),
    );
    await act(async () => {
      await result.current.selectPort().catch(() => {});
    });
    expect(result.current.transport).toBeUndefined();
  });
});
