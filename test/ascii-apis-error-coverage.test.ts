import { isErr } from "option-t/plain_result";
import { describe, expect, it } from "vitest";
import {
  readCoils,
  readDiscreteInputs,
  readHoldingRegisters as readHoldingRegistersASCII,
  readInputRegisters,
  writeMultipleCoils,
  writeMultipleRegisters,
  writeSingleCoil,
  writeSingleRegister as writeSingleRegisterASCII,
} from "../src/ascii.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";

// Execute ASCII API functions against a disconnected transport to cover
// early error return paths and raise function coverage without complex setup.
describe("ASCII API error coverage", () => {
  const t = new MockTransport({ name: "ascii", type: "mock" }); // never connected

  it("read functions return transport not connected", async () => {
    const results = await Promise.all([
      readCoils(t, 1, 0, 1),
      readDiscreteInputs(t, 1, 0, 1),
      readHoldingRegistersASCII(t, 1, 0, 1),
      readInputRegisters(t, 1, 0, 1),
    ]);
    results.forEach((r) => {
      expect(isErr(r)).toBe(true);
    });
  });

  it("write functions return transport not connected", async () => {
    const results = await Promise.all([
      writeSingleCoil(t, 1, 0, true),
      writeSingleRegisterASCII(t, 1, 0, 42),
      writeMultipleCoils(t, 1, 0, [true, false, true]),
      writeMultipleRegisters(t, 1, 0, [1, 2, 3]),
    ]);
    results.forEach((r) => {
      expect(isErr(r)).toBe(true);
    });
  });
});
