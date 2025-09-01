import { describe, expect, it } from "vitest";
import { calculateCRC16 } from "../src/crc.ts";
import { ModbusCRCError, ModbusFrameError, ModbusLRCError } from "../src/errors.ts";
import {
  checkFrameCRC,
  findFrameResyncPosition,
  isPlausibleFrameStart,
  parseASCIIFrame,
  parseBitData,
  parseRegisterData,
  parseRTUFrame,
  type ParsedFrame
} from "../src/frameParser.ts";
import { calculateLRC } from "../src/lrc.ts";

function buildRTUFrame(slaveId:number, fc:number, payload:number[]): number[] {
  const body = [slaveId, fc, ...payload];
  const crc = calculateCRC16(body);
  const lo = crc & 0xFF;
  const hi = (crc >> 8) & 0xFF;
  return [...body, lo, hi];
}

function buildASCIIFrame(bytes:number[]): string {
  const lrc = calculateLRC(bytes);
  return `:${[...bytes, lrc].map(b=>b.toString(16).padStart(2,"0")).join("")}`;
}

describe("frameParser utilities", () => {
  it("parseBitData pads with zeros when insufficient bytes", () => {
    expect(parseBitData([0b1010_0101], 12)).toEqual([
      1,0,1,0,0,1,0,1, // first byte LSB first
      0,0,0,0 // padded
    ]);
  });

  it("parseRegisterData ignores trailing odd byte", () => {
    expect(parseRegisterData([0x12,0x34,0x56])).toEqual([0x1234]);
  });

  it("isPlausibleFrameStart validates slave/function ranges", () => {
    const buf = [1,3,0,0];
    expect(isPlausibleFrameStart(buf,0)).toBe(true);
    expect(isPlausibleFrameStart([0,3],0)).toBe(false); // invalid slave
  });

  it("findFrameResyncPosition finds next plausible start", () => {
    const buf = [0,0, 1,3,2,0,1];
    expect(findFrameResyncPosition(buf)).toBe(2);
  });
});

describe("parseRTUFrame", () => {
  it("errors on too short frame", () => {
    const r = parseRTUFrame([1,3,0]);
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusFrameError);
  });

  it("errors on incomplete header for variable length read", () => {
    const r = parseRTUFrame([1,3]);
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusFrameError);
  });

  it("errors on unknown function code", () => {
    const frame = [1,99,0,0];
    const r = parseRTUFrame(frame);
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusFrameError);
  });

  it("errors on incomplete frame", () => {
    // FC3 expects 3 + byteCount + 2. Give less.
    const frame = [1,3,4, 0x11,0x22];
    const r = parseRTUFrame(frame);
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusFrameError);
  });

  it("detects CRC error", () => {
    const good = buildRTUFrame(1,3,[2,0x00,0x01]);
    // flip a data byte causing CRC mismatch
    const bad = [...good];
    bad[3] ^= 0xFF;
    const r = parseRTUFrame(bad);
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusCRCError);
  });

  it("parses normal read response", () => {
    const frame = buildRTUFrame(1,3,[2,0x00,0x05]);
    const r = parseRTUFrame(frame);
  expect(r.success).toBe(true);
  // For FC3 the parser returns the raw data bytes after byte count => [0x00,0x05]
  expect((r as any).data.data).toEqual([0x00,0x05]);
  });

  it("parses write single register echo", () => {
    // FC6 echo: slave,6,addr hi,addr lo,val hi,val lo,crc lo,crc hi
    const frame = buildRTUFrame(1,6,[0x00,0x10,0x12,0x34]);
    const r = parseRTUFrame(frame);
    expect(r.success).toBe(true);
    const data = (r as any).data.data;
    expect(data).toEqual([0x00,0x10,0x12,0x34]);
  });

  it("parses exception frame", () => {
    // exception frame: slave, (fc|0x80), exceptionCode, crc
    const base = [1, 0x83, 2];
    const crc = calculateCRC16(base);
    const lo = crc & 0xFF, hi = (crc>>8)&0xFF;
    const frame = [...base, lo, hi];
    const r = parseRTUFrame(frame);
    expect(r.success).toBe(true);
    const pf = (r as any).data as ParsedFrame;
    expect(pf.isException).toBe(true);
    expect(pf.exceptionCode).toBe(2);
    expect(pf.functionCode).toBe(3); // masked
  });
});

describe("parseASCIIFrame", () => {
  it("rejects invalid start", () => {
    const r = parseASCIIFrame("abc");
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusFrameError);
  });

  it("rejects odd length", () => {
    const r = parseASCIIFrame(":01030");
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusFrameError);
  });

  it("rejects invalid hex pair", () => {
    const r = parseASCIIFrame(":01GG");
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusFrameError);
  });

  it("rejects too short", () => {
    const r = parseASCIIFrame(":01");
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusFrameError);
  });

  it("rejects LRC mismatch", () => {
    const frame = ":0103FF"; // LRC wrong intentionally
    const r = parseASCIIFrame(frame);
    expect(r.success).toBe(false);
    expect((r as any).error).toBeInstanceOf(ModbusLRCError);
  });

  it("parses normal frame", () => {
    // Build read response: slave=1, fc=3, data bytes [2, 0x00,0x10]
    const bytes = [1,3,2,0x00,0x10];
    const str = buildASCIIFrame(bytes);
    const r = parseASCIIFrame(str);
    expect(r.success).toBe(true);
    const pf = (r as any).data as ParsedFrame;
  // Expect only register bytes after byte count
  expect(pf.data).toEqual([0x00,0x10]);
  });

  it("parses exception frame", () => {
    const bytes = [1, 0x83, 2];
    const str = buildASCIIFrame(bytes);
    const r = parseASCIIFrame(str);
    expect(r.success).toBe(true);
    const pf = (r as any).data as ParsedFrame;
    expect(pf.isException).toBe(true);
    expect(pf.exceptionCode).toBe(2);
    expect(pf.functionCode).toBe(3);
  });
});

describe("checkFrameCRC", () => {
  it("returns false when CRC mismatch", () => {
    const frame = buildRTUFrame(1,3,[2,0x00,0x01]);
    frame[3] ^= 0xFF; // corrupt
    expect(checkFrameCRC(frame, frame.length)).toBe(false);
  });

  it("returns true when CRC matches", () => {
    const frame = buildRTUFrame(1,3,[2,0x00,0x01]);
    expect(checkFrameCRC(frame, frame.length)).toBe(true);
  });
});
