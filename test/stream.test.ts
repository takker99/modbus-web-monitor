import { describe, expect, it } from "vitest";
import { byteStreamFromTransport, readOneChunk } from "../src/stream.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";

// Additional coverage for stream helpers (abort, error, close paths)

describe("byteStreamFromTransport", () => {
  it("yields chunks then ends on close", async () => {
    const t = new MockTransport({ type: "mock" });
    await t.connect();
    const chunks: Uint8Array[] = [];
    const consumeP = (async () => {
      for await (const c of byteStreamFromTransport(t)) {
        chunks.push(c);
      }
    })();
    t.simulateData(new Uint8Array([1, 2]));
    t.simulateData(new Uint8Array([3]));
    await t.disconnect();
    await consumeP;
    expect(chunks.map((c) => Array.from(c))).toEqual([[1, 2], [3]]);
  });

  it("propagates error event", async () => {
    const t = new MockTransport({ type: "mock" });
    await t.connect();
    const iter = (async () => {
      try {
        for await (const _ of byteStreamFromTransport(t)) {
          // consume
        }
      } catch (e) {
        return (e as Error).message;
      }
      return "no-error";
    })();
    // Simulate error event
    t.dispatchEvent(new CustomEvent("error", { detail: new Error("boom") }));
    const msg = await iter;
    expect(msg).toBe("boom");
  });

  it("abort signal terminates iteration", async () => {
    const t = new MockTransport({ type: "mock" });
    await t.connect();
    const controller = new AbortController();
    const seen: Uint8Array[] = [];
    const iterP = (async () => {
      try {
        for await (const c of byteStreamFromTransport(t, {
          signal: controller.signal,
        })) {
          seen.push(c);
        }
        return "completed";
      } catch (e) {
        return (e as Error).message;
      }
    })();
    t.simulateData(new Uint8Array([9]));
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await iterP;
    expect(seen.length).toBe(1);
  });
});

describe("readOneChunk", () => {
  it("returns first chunk", async () => {
    const t = new MockTransport({ type: "mock" });
    await t.connect();
    setTimeout(() => t.simulateData(new Uint8Array([5, 6, 7])), 0);
    const r = await readOneChunk(t);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(r.val)).toEqual([5, 6, 7]);
  });

  it("returns error when ended without data", async () => {
    const t = new MockTransport({ type: "mock" });
    await t.connect();
    const controller = new AbortController();
    const p = readOneChunk(t, { signal: controller.signal });
    // Abort immediately before any data arrives
    controller.abort();
    const r = await p;
    expect(r.ok).toBe(false);
  });
});
