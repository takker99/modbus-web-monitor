import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SerialManager } from "../src/serial.ts";

const mockNavigator = { serial: { requestPort: vi.fn() } };

class BasicPort {
  isOpen = false;
  get readable() {
    // biome-ignore lint/suspicious/noExplicitAny: For test case
    return null as any;
  }
  get writable() {
    return {
      getWriter: () => ({
        close: async () => {},
        write: async (_d: Uint8Array) => {},
      }),
      // biome-ignore lint/suspicious/noExplicitAny: For test case
    } as any;
  }
  async open() {
    if (this.isOpen) throw new Error("already");
    this.isOpen = true;
  }
  async close() {
    this.isOpen = false;
  }
}
class FailingOpenPort extends BasicPort {
  async open() {
    throw new Error("open fail");
  }
}

describe("SerialManager connect edge branches", () => {
  let sm: SerialManager;
  beforeEach(() => {
    vi.stubGlobal("navigator", mockNavigator);
    sm = new SerialManager();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("throws when connecting without selecting port", async () => {
    await expect(
      sm.connect({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 }),
    ).rejects.toThrow("No port selected");
  });

  it("throws when connecting twice", async () => {
    const port = new BasicPort();
    mockNavigator.serial.requestPort.mockResolvedValueOnce(
      port as unknown as SerialPort,
    );
    await sm.selectPort();
    await sm.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
    });
    await expect(
      sm.connect({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 }),
    ).rejects.toThrow("Already connected");
  });

  it("propagates open failure", async () => {
    const port = new FailingOpenPort();
    mockNavigator.serial.requestPort.mockResolvedValueOnce(
      port as unknown as SerialPort,
    );
    await sm.selectPort();
    await expect(
      sm.connect({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 }),
    ).rejects.toThrow(/Failed to connect: open fail/);
    expect(sm.connected).toBe(false);
  });
});
