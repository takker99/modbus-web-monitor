import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SerialManager } from "../src/serial.ts";

// Mock objects with error throwing on close/release
class FaultyReader {
  constructor(private opts: { cancelError?: Error; releaseError?: Error }) {}
  async read() {
    return { done: true };
  }
  async cancel() {
    if (this.opts.cancelError) throw this.opts.cancelError;
  }
  releaseLock() {
    if (this.opts.releaseError) throw this.opts.releaseError;
  }
}
class FaultyWriter {
  constructor(private opts: { closeError?: Error }) {}
  async write(_d: Uint8Array) {}
  async close() {
    if (this.opts.closeError) throw this.opts.closeError;
  }
}
class FaultyPort {
  isOpen = true;
  constructor(
    private errors: {
      portCloseError?: Error;
      reader?: FaultyReader;
      writer?: FaultyWriter;
    },
  ) {}
  get readable() {
    if (!this.errors.reader) {
      this.errors.reader = new FaultyReader({});
    }
    return { getReader: () => this.errors.reader } as unknown as {
      getReader: () => FaultyReader;
    };
  }
  get writable() {
    if (!this.errors.writer) {
      this.errors.writer = new FaultyWriter({});
    }
    return { getWriter: () => this.errors.writer } as unknown as {
      getWriter: () => FaultyWriter;
    };
  }
  async open() {}
  async close() {
    if (this.errors.portCloseError) throw this.errors.portCloseError;
    this.isOpen = false;
  }
}

const mockNavigator = { serial: { requestPort: vi.fn() } };

describe("SerialManager error side branches", () => {
  let sm: SerialManager;
  let port: FaultyPort;
  beforeEach(() => {
    vi.stubGlobal("navigator", mockNavigator);
    sm = new SerialManager();
    port = new FaultyPort({
      portCloseError: new Error("close fail"),
      reader: new FaultyReader({
        cancelError: new Error("cancel fail"),
        releaseError: new Error("release fail"),
      }),
      writer: new FaultyWriter({ closeError: new Error("writer close fail") }),
    });
    mockNavigator.serial.requestPort.mockResolvedValue(
      port as unknown as SerialPort,
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("disconnect path swallows internal errors (unexpected disconnect scenario)", async () => {
    const portDisc: string[] = [];
    sm.on("portDisconnected", () => portDisc.push("p"));
    await sm.selectPort();
    await sm.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
    });
    // Wait a moment for read loop to process immediate done=true
    await new Promise((r) => setTimeout(r, 20));
    expect(portDisc).toHaveLength(1);
    expect(sm.connected).toBe(false);
  });

  it("send throws when writer not present", async () => {
    await expect(sm.send(new Uint8Array([1]))).rejects.toThrow(/not open/);
  });

  it("classifies network read error as disconnect", async () => {
    // Prepare a port whose reader will throw a network error once
    class NetErrorReader extends FaultyReader {
      thrown = false;
      constructor() {
        super({});
      }
      async read() {
        if (!this.thrown) {
          this.thrown = true;
          throw new Error("Network failure during read");
        }
        return { done: true };
      }
    }
    class NetPort extends FaultyPort {
      get readable() {
        return { getReader: () => new NetErrorReader() } as unknown as {
          getReader: () => NetErrorReader;
        };
      }
      get writable() {
        return { getWriter: () => new FaultyWriter({}) } as unknown as {
          getWriter: () => FaultyWriter;
        };
      }
    }
    const netPort = new NetPort({});
    mockNavigator.serial.requestPort.mockResolvedValueOnce(
      netPort as unknown as SerialPort,
    );
    const events: string[] = [];
    sm.on("portDisconnected", () => events.push("p"));
    await sm.selectPort();
    await sm.connect({
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(events).toHaveLength(1);
  });
});
