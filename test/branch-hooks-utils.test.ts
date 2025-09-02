//@vitest-environment jsdom

import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import { useLogs } from "../src/frontend/hooks/useLogs.ts";
import { usePolling } from "../src/frontend/hooks/usePolling.ts";
import { useSerial } from "../src/frontend/hooks/useSerial.ts";
import {
  formatAddress,
  formatValue,
  parseCoilValues,
  parseRegisterValues,
} from "../src/frontend/modbusUtils.ts";
import { renderHook } from "./vitest-render-hook";

// Edge case helpers for modbusUtils

describe("modbusUtils edge cases", () => {
  it("parseCoilValues throws when exceeding 1968 limit", () => {
    const many = Array.from({ length: 1970 }, (_, i) =>
      (i % 2).toString(),
    ).join(",");
    expect(() => parseCoilValues(many)).toThrow(/Too many coils/);
  });
  it("parseRegisterValues parses mixed hex/dec and enforces upper bound", () => {
    const mixed = ["0x0001", "2", "0x0003", "4", "0x0005"];
    const extraWithin = Array.from({ length: 118 }, (_, i) =>
      (i + 6).toString(),
    ); // total 123
    const parsed = parseRegisterValues([...mixed, ...extraWithin].join(","), {
      hex: true,
    });
    expect(parsed.length).toBe(123);
    expect(parsed[0]).toBe(1);
    expect(parsed[2]).toBe(3);
    // exceeding
    const exceeding = [...parsed, 999];
    expect(() =>
      parseRegisterValues(exceeding.join(","), { hex: false }),
    ).toThrow(/Too many registers/);
  });
  it("formatValue hex vs decimal", () => {
    expect(formatValue(255, { hex: true })).toBe("0x00FF");
    expect(formatValue(255, { hex: false })).toBe("255");
  });
  it("formatAddress hex vs decimal", () => {
    expect(formatAddress(16, { hex: true })).toBe("0x0010");
    expect(formatAddress(16, { hex: false })).toBe("16");
  });
});

describe("usePolling branch guards", () => {
  it("start ignored when already polling; stop ignored when not", () => {
    const calls: number[] = [];
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      usePolling({
        clearIntervalFn: clearInterval,
        setIntervalFn: setInterval,
      }),
    );
    act(() => {
      result.current.start(() => calls.push(Date.now()), 500);
    });
    act(() => {
      result.current.start(() => calls.push(Date.now()), 300);
    }); // should be ignored (branch)
    // advance timers
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    act(() => {
      result.current.stop();
    });
    act(() => {
      result.current.stop();
    }); // ignored branch
    vi.useRealTimers();
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("useSerial branch: no events before select/connect", () => {
  it("state remains disconnected until operations", () => {
    const { result } = renderHook(() => useSerial());
    expect(result.current.connected).toBe(false);
    expect(result.current.portSelected).toBe(false);
  });
});

describe("useLogs timestamp ordering and ring buffer edge", () => {
  it("keeps only latest 100 entries and orders by insertion", () => {
    let now = 0;
    const { result } = renderHook(() =>
      useLogs({ max: 100, now: () => new Date(++now) }),
    );
    for (let i = 0; i < 105; i++) {
      act(() => {
        result.current.addLog("Info", `msg${i}`);
      });
    }
    expect(result.current.logs.length).toBe(100);
    // first should be msg5
    expect(result.current.logs[0].message).toBe("msg5");
    expect(result.current.logs[99].message).toBe("msg104");
  });
});
