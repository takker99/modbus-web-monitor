import { describe, expect, it } from "vitest";
import { calculateCRC16 } from "../src/crc.ts";
import { parseRTUFrame } from "../src/frameParser.ts";
import { rtuFrameStream } from "../src/rtu.ts";
import { byteStreamFromTransport } from "../src/stream.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";

async function collect(iter: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const f of iter) out.push(f);
  return out;
}

describe("rtuFrameStream", () => {
  it("yields a single full frame across multiple chunks", async () => {
    const t = new MockTransport({ type: "mock" });
    await t.connect();
    // Valid holding registers RESPONSE: slave=1 fc=3 byteCount=2 data=0x00 0x2A
    const core = [1, 3, 2, 0x00, 0x2a];
    const crc = calculateCRC16(new Uint8Array(core));
    core.push(crc & 0xff, (crc >> 8) & 0xff);
    const frame = new Uint8Array(core);
    const framesP = collect(rtuFrameStream(byteStreamFromTransport(t)));
    // Ensure listeners attached before emitting
    await Promise.resolve();
    t.simulateData(frame.slice(0, 3));
    t.simulateData(frame.slice(3));
    await t.disconnect();
    const frames = await framesP;
    expect(frames.length).toBe(1);
    const parsed = parseRTUFrame(Array.from(frames[0]));
    expect(parsed.ok).toBe(true);
  });

  it("resyncs after noise bytes before valid frame", async () => {
    const t = new MockTransport({ type: "mock" });
    await t.connect();
    const core = [1, 3, 2, 0x12, 0x34];
    const crc = calculateCRC16(new Uint8Array(core));
    core.push(crc & 0xff, (crc >> 8) & 0xff);
    const frame = new Uint8Array(core);
    const framesP = collect(rtuFrameStream(byteStreamFromTransport(t)));
    await Promise.resolve();
    t.simulateData(new Uint8Array([0xff, 0xee, 0xdd])); // noise
    t.simulateData(frame);
    await t.disconnect();
    const frames = await framesP;
    expect(frames.length).toBe(1);
    const parsed = parseRTUFrame(Array.from(frames[0]));
    expect(parsed.ok).toBe(true);
  });
});
