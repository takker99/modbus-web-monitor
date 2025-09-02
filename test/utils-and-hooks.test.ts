/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLogs } from "../src/frontend/hooks/useLogs.ts";
import { usePolling } from "../src/frontend/hooks/usePolling.ts";
import {
  formatAddress,
  formatValue,
  parseCoilValues,
  parseRegisterValues,
} from "../src/frontend/modbusUtils.ts";
import { act, renderHook } from "./vitest-render-hook.ts";

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
