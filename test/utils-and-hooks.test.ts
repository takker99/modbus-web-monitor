/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLogs } from "../src/frontend/hooks/useLogs.ts";
import { usePolling } from "../src/frontend/hooks/usePolling.ts";
import {
  type SerialManagerLike,
  useSerial,
} from "../src/frontend/hooks/useSerial.ts";
import {
  formatAddress,
  formatValue,
  parseCoilValues,
  parseRegisterValues,
} from "../src/frontend/modbusUtils.ts";
import { act, renderHook } from "./vitest-render-hook";

// --- Pure utilities ---
describe("modbusUtils", () => {
  it("parseCoilValues parses and validates", () => {
    expect(parseCoilValues("1 0,1\n0")).toEqual([1, 0, 1, 0]);
    expect(() => parseCoilValues("2")).toThrow(/Invalid coil value/);
    expect(() => parseCoilValues("")).toThrow(/No coil values/);
  });
  it("parseRegisterValues parses decimal and hex", () => {
    expect(parseRegisterValues("1 2 3", { hex: false })).toEqual([1, 2, 3]);
    expect(parseRegisterValues("0x10 20", { hex: true })).toEqual([0x10, 0x20]);
    expect(parseRegisterValues("10 20", { hex: true })).toEqual([0x10, 0x20]);
    expect(() => parseRegisterValues("70000", { hex: false })).toThrow(
      /Invalid register value/,
    );
  });
  it("format helpers", () => {
    expect(formatValue(0x1a2, { hex: true })).toBe("0x01A2");
    expect(formatValue(10, { hex: false })).toBe("10");
    expect(formatAddress(0x2b, { hex: true })).toBe("0x002B");
  });
});

// --- Hooks ---
describe("useLogs", () => {
  it("adds and truncates logs", () => {
    const now = vi.fn(() => new Date("2024-01-01T00:00:00Z"));
    const { result } = renderHook(() => useLogs({ max: 3, now }));
    act(() => result.current.addLog("Info", "a"));
    act(() => result.current.addLog("Info", "b"));
    act(() => result.current.addLog("Info", "c"));
    act(() => result.current.addLog("Info", "d"));
    expect(
      result.current.logs.map((l: { message: string }) => l.message),
    ).toEqual(["b", "c", "d"]);
    act(() => result.current.clearLogs());
    expect(result.current.logs).toHaveLength(0);
  });
});

describe("usePolling", () => {
  beforeEach(() => vi.useFakeTimers());
  it("start/stop/restart behavior", () => {
    const cb = vi.fn();
    const { result } = renderHook(() =>
      usePolling({
        clearIntervalFn: clearInterval,
        setIntervalFn: setInterval,
      }),
    );
    act(() => result.current.start(cb, 1000));
    expect(result.current.isPolling).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(2);
    act(() => result.current.restart(cb, 500));
    vi.advanceTimersByTime(1000);
    // after restart total calls >= 4
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(4);
    act(() => result.current.stop());
    expect(result.current.isPolling).toBe(false);
  });
  afterEach(() => vi.useRealTimers());
});

// For useSerial we supply a mock SerialManager minimal implementation
type Listener = (...args: unknown[]) => void;
class MockSerialManager implements SerialManagerLike {
  private listeners: Record<string, Listener[]> = {};
  on(ev: string, fn: Listener) {
    if (!this.listeners[ev]) this.listeners[ev] = [];
    (this.listeners[ev] as Listener[]).push(fn);
  }
  off(ev: string, fn: Listener) {
    this.listeners[ev] = (this.listeners[ev] || []).filter((f) => f !== fn);
  }
  emit(ev: string, ...args: unknown[]) {
    (this.listeners[ev] || []).forEach((f) => {
      f(...args);
    });
  }
  selectPort = vi.fn(async () => {
    this.emit("portSelected");
  });
  connect = vi.fn(async () => {
    this.emit("connected");
  });
  disconnect = vi.fn(async () => {
    this.emit("disconnected");
  });
  reconnect = vi.fn(async () => {
    this.emit("connected");
  });
}

describe("useSerial", () => {
  it("tracks connection and port states", async () => {
    const mgr = new MockSerialManager();
    // useSerial expects a SerialManager; we provide subset and cast via unknown -> SerialManagerSubset
    const { result } = renderHook(() => useSerial({ manager: mgr }));
    expect(result.current.portSelected).toBe(false);
    await result.current.selectPort();
    expect(result.current.portSelected).toBe(true);
    await result.current.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
    });
    expect(result.current.connected).toBe(true);
    await result.current.disconnect();
    expect(result.current.connected).toBe(false);
  });
  it("handles unexpected disconnect event", async () => {
    const mgr = new MockSerialManager();
    const { result } = renderHook(() => useSerial({ manager: mgr }));
    await result.current.selectPort();
    await result.current.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
    });
    expect(result.current.connected).toBe(true);
    // simulate unexpected
    act(() => {
      (mgr as unknown as { emit: (ev: string) => void }).emit(
        "portDisconnected",
      );
    });
    expect(result.current.connected).toBe(false);
    expect(result.current.portDisconnected).toBe(true);
  });
});
