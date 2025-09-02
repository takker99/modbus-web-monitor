import { isOk, unwrapErr } from "option-t/plain_result";
import { describe, expect, it } from "vitest";
import { buildWriteRequest } from "../src/frameBuilder.ts";
import { parseRTUFrame, validateRTUFrame } from "../src/frameParser.ts";

describe("Additional branch coverage final", () => {
  it("frameBuilder FC15 all-zero coils covers else branch", () => {
    const frame = buildWriteRequest(
      {
        address: 0,
        functionCode: 15,
        slaveId: 1,
        value: Array(9).fill(0), // 9 bits => 2 bytes, all zero so inner if(bit) never taken
      },
      "rtu",
    );
    // Structure: id,fc,addrHi,addrLo,qtyHi,qtyLo,byteCount,<coilBytes>,crcLo,crcHi
    // qty=9 -> qtyHi=0, qtyLo=9, byteCount=2, coil bytes both zero
    expect(frame[4]).toBe(0); // qtyHi
    expect(frame[5]).toBe(9); // qtyLo
    expect(frame[6]).toBe(2); // byteCount
    expect(frame[7]).toBe(0); // first coil byte
    expect(frame[8]).toBe(0); // second coil byte
  });

  it("parseRTUFrame incomplete normal response branch", () => {
    // FC3 with declared byte count 4 but only header + crc provided insufficiently
    // Need buffer shorter than expectedLength to hit incomplete frame branch
    const partial = [1, 3, 4, 0x12, 0x34]; // missing remaining bytes + crc
    const result = parseRTUFrame(partial);
    if (isOk(result)) {
      throw new Error("Should not parse incomplete frame successfully");
    }
    expect(unwrapErr(result).message).toMatch(/Incomplete frame/);
  });

  it("validateRTUFrame incomplete frame for FC5", () => {
    // FC5 expected length 8, provide only 7
    const frame = [1, 5, 0x00, 0x10, 0xff, 0x00, 0x12];
    const res = validateRTUFrame(frame);
    expect(isOk(res)).toBe(false);
    expect(unwrapErr(res).message).toMatch(
      /Incomplete frame|RTU frame too short/,
    );
  });
});
