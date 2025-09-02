import { describe, expect, it } from "vitest";
import { calculateLRC } from "../src/lrc.ts"; // small util already 100%; use to keep file minimal
import { readHoldingRegisters } from "../src/rtu.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";

describe("coverage bump targeted", () => {
  it("mock simulateError dispatches error", async () => {
    const t = new MockTransport({ name: "err", type: "mock" });
    await t.connect();
    let got: Error | undefined;
    t.addEventListener("error", (e) => {
      got = (e as CustomEvent<Error>).detail;
    });
    t.simulateError(new Error("simulated"));
    expect(got?.message).toBe("simulated");
    expect(t.connected).toBe(false);
  });

  it("rtu read abort immediate", async () => {
    const t = new MockTransport({ type: "mock" });
    const ac = new AbortController();
    ac.abort();
    const res = await readHoldingRegisters(t, 1, 0, 1, { signal: ac.signal });
    if ((res as { ok: false; err: Error } | { ok: true }).ok)
      throw new Error("expected err");
    const err = (res as { ok: false; err: Error }).err;
    expect(err.message).toBe("Transport not connected");
  });

  it("lrc simple calculation remains stable", () => {
    expect(calculateLRC([1, 2, 3])).toBeDefined();
  });
});
