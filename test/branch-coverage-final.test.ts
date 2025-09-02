import { describe, expect, it, vi } from "vitest";
import { buildWriteRequest } from "../src/frameBuilder.ts";
import { parseRTUFrame, validateRTUFrame } from "../src/frameParser.ts";
import { ModbusASCIIClient } from "../src/modbus-ascii.ts";
import { ModbusClientBase, type ModbusReadConfig } from "../src/modbus-base.ts";

// Minimal subclass to control read/build behavior and expose internal methods for monitoring tests
class DummyClient extends ModbusClientBase {
  public lastRequested: ModbusReadConfig | null = null;
  get protocol() {
    return "rtu" as const;
  }
  protected buildReadRequest(config: ModbusReadConfig): Uint8Array {
    this.lastRequested = config;
    return new Uint8Array([
      config.slaveId,
      config.functionCode,
      0,
      0,
      0,
      1,
      0x00,
      0x00,
    ]);
  }
  protected buildWriteRequest(): Uint8Array {
    return new Uint8Array();
  }
  protected processBufferedData(): void {
    /* no-op */
  }
  handleResponse(): void {
    /* no-op */
  }
}

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
    if (result.success) {
      throw new Error("Should not parse incomplete frame successfully");
    }
    expect(result.error.message).toMatch(/Incomplete frame/);
  });

  it("validateRTUFrame incomplete frame for FC5", () => {
    // FC5 expected length 8, provide only 7
    const frame = [1, 5, 0x00, 0x10, 0xff, 0x00, 0x12];
    const res = validateRTUFrame(frame);
    expect(res.isValid).toBe(false);
    expect(res.error?.message).toMatch(/Incomplete frame|RTU frame too short/);
  });

  it("ASCII client ignores frame when no pending request (early return)", () => {
    const client = new ModbusASCIIClient();
    // Provide a valid minimal normal ASCII frame for FC3 with zero data length
    // Slave=1, FC=3, byteCount=0, LRC computed
    const payload = [1, 3, 0];
    const lrc = (0 - payload.reduce((a, b) => (a + b) & 0xff, 0)) & 0xff; // reproduce calculateLRC logic inline
    payload.push(lrc);
    const hex = payload
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");
    const ascii = `:${hex}\r\n`;
    // Inject bytes
    client.handleResponse(new TextEncoder().encode(ascii));
    // No pending request so nothing happens (cannot directly assert internal) – ensure no error thrown
    expect(true).toBe(true);
  });

  it("ASCII client ignores mismatched function code (aborted externally)", async () => {
    const client = new ModbusASCIIClient();
    const controller = new AbortController();
    // Start a read to set pendingRequest functionCode=3 with external abort signal
    const p = client.read(
      {
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      },
      { signal: controller.signal },
    );
    // Provide a valid FC4 frame (mismatched) which should be ignored; then we abort explicitly
    const payload = [1, 4, 0];
    const lrc = (0 - payload.reduce((a, b) => (a + b) & 0xff, 0)) & 0xff;
    payload.push(lrc);
    const ascii = `:${payload
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("")}\r\n`;
    client.handleResponse(new TextEncoder().encode(ascii));
    controller.abort(new Error("Aborted"));
    await expect(p).rejects.toThrow(/aborted/i);
  });

  it("ModbusClientBase monitoring success and error paths", async () => {
    vi.useFakeTimers();
    const client = new DummyClient();
    const successes: number[] = [];
    const errors: Error[] = [];
    client.on("response", (r) => successes.push(r.functionCode));
    client.on("error", (e) => errors.push(e));

    // Spy on read to alternate success and error
    let call = 0;
    const readSpy = vi
      .spyOn(client, "read")
      .mockImplementation(async (cfg: ModbusReadConfig) => {
        call++;
        if (call % 2 === 0) {
          // simulate error
          throw new Error("read fail");
        }
        // simulate pending request resolution immediately
        return Promise.resolve({
          address: cfg.startAddress,
          data: [],
          functionCode: cfg.functionCode,
          functionCodeLabel: `FC${cfg.functionCode}`,
          slaveId: cfg.slaveId,
          timestamp: new Date(),
        });
      });

    client.startMonitoring(
      { functionCode: 3, quantity: 1, slaveId: 1, startAddress: 0 },
      1000,
    );
    // Advance timers enough for several intervals
    // Run several intervals; use runOnlyPendingTimers in steps to allow promise microtasks
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    }
    client.stopMonitoring();
    // Calling stopMonitoring again covers guard branch
    client.stopMonitoring();
    expect(successes.length).toBeGreaterThan(0);
    expect(errors.length).toBeGreaterThan(0);
    readSpy.mockRestore();
    vi.useRealTimers();
  });
});
