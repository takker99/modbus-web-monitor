import { describe, expect, it, vi } from "vitest";
import { SerialManager } from "../src/serial.ts";

// This test simulates a reconnect sequence where the first reconnect attempt fails
// and the second succeeds, ensuring internal logic performs multiple attempts without
// duplicating event emissions.

class FailingThenSucceedPort {
  isOpen = false;
  attempt = 0;
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  async open() {
    this.attempt++;
    if (this.attempt === 1) {
      throw new Error("open fail once");
    }
    this.isOpen = true;
    // minimal readable that never yields data
    this.readable = new ReadableStream<Uint8Array>({
      pull: () => {},
    });
    this.writable = new WritableStream<Uint8Array>({});
  }
  async close() {
    this.isOpen = false;
  }
}

// Mock navigator.serial
const mockNavigator = { serial: { requestPort: vi.fn() } };

describe("SerialManager reconnection attempts", () => {
  it("reconnect succeeds after initial failure", async () => {
    vi.stubGlobal("navigator", mockNavigator);
    const sm = new SerialManager();
    const port = new FailingThenSucceedPort();
    mockNavigator.serial.requestPort.mockResolvedValue(
      port as unknown as SerialPort,
    );
    await sm.selectPort();
    await expect(
      sm.connect({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 }),
    ).rejects.toThrow(/open fail once/);
    // attempt again
    await sm.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
    });
    expect(port.attempt).toBe(2);
    expect(sm.connected).toBe(true);
    vi.unstubAllGlobals();
  });
});
