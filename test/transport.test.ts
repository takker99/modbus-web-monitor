import { beforeEach, describe, expect, it } from "vitest";
import { MockTransport } from "../src/transport/mock-transport.ts";
import { SerialTransport } from "../src/transport/serial-transport.ts";
import { TcpTransport } from "../src/transport/tcp-transport.ts";
import type {
  MockTransportConfig,
  SerialTransportConfig,
} from "../src/transport/transport.ts";
import { MockSerialPort } from "./mock-serial-port.ts";

// Clean minimal transport tests (EventTarget API)
describe("transport: minimal", () => {
  describe("mock", () => {
    let transport: MockTransport;
    let cfg: MockTransportConfig;
    beforeEach(() => {
      cfg = { name: "demo", type: "mock" };
      transport = new MockTransport(cfg);
    });
    it("connect + auto response", async () => {
      const req = new Uint8Array([1]);
      const res = new Uint8Array([2]);
      transport.setAutoResponse(req, res);
      await transport.connect();
      let got: Uint8Array | null = null;
      transport.addEventListener("message", (ev) => {
        got = (ev as CustomEvent<Uint8Array>).detail;
      });
      transport.postMessage(req);
      await new Promise((r) => setTimeout(r, 5));
      expect(got).toEqual(res);
    });
    it("send failure throws + emits error", async () => {
      const failing = new MockTransport(cfg, {
        errorMessage: "boom",
        shouldFailSend: true,
      });
      await failing.connect();
      let err: Error | null = null;
      failing.addEventListener("error", (ev) => {
        err = (ev as CustomEvent<Error>).detail;
      });
      expect(() => failing.postMessage(new Uint8Array([9]))).toThrow("boom");
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("serial", () => {
    it("postMessage when disconnected emits error", () => {
      const cfg: SerialTransportConfig = {
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        type: "serial",
      };
      const serial = new SerialTransport(
        cfg,
        new MockSerialPort() as unknown as SerialPort,
      );
      let err: Error | null = null;
      serial.addEventListener(
        "error",
        (ev) => {
          err = (ev as CustomEvent<Error>).detail;
        },
        { once: true },
      );
      serial.postMessage(new Uint8Array([1]));
      expect(err).toBeInstanceOf(Error);
      // @ts-expect-error test message presence
      expect(err?.message).toBe("Transport not connected");
    });

    it("connect success sets up writer (no open event now)", async () => {
      const cfg: SerialTransportConfig = {
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        type: "serial",
      };
      const port = new MockSerialPort();
      const serial = new SerialTransport(cfg, port);
      await serial.connect();
      expect(serial.connected).toBe(true);
    });

    it("async write error dispatch", async () => {
      const cfg: SerialTransportConfig = {
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        type: "serial",
      };
      // Custom mock port whose writer.write rejects
      class FailingPort extends MockSerialPort {
        override get writable() {
          const base = super.writable;
          if (!base) return base;
          return {
            getWriter: () => ({
              close: () => Promise.resolve(),
              releaseLock: () => {},
              write: () => Promise.reject(new Error("fail")),
            }),
          } as unknown as WritableStream<Uint8Array>;
        }
      }
      const port = new FailingPort();
      const serial = new SerialTransport(cfg, port);
      await serial.connect();
      let got: Error | undefined;
      serial.addEventListener("error", (ev) => {
        got = (ev as CustomEvent<Error>).detail;
      });
      serial.postMessage(new Uint8Array([9]));
      await new Promise((r) => setTimeout(r, 0));
      expect(got?.message).toBe("fail");
    });
  });

  it("tcp unsupported connect", async () => {
    const tcp = new TcpTransport({ host: "localhost", port: 502, type: "tcp" });
    await expect(tcp.connect()).rejects.toThrow("TCP transport not supported");
  });
});
