import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTransport,
  MockTransport,
  type MockTransportConfig,
  SerialTransport,
  type SerialTransportConfig,
  TransportRegistry,
} from "../src/transport/index.ts";

// Clean minimal transport tests (EventTarget API)
describe("transport: minimal", () => {
  it("registry unknown type", () => {
    expect(() =>
      TransportRegistry.create({
        type: "nope",
      } as unknown as MockTransportConfig),
    ).toThrow("Unknown transport type: nope");
  });

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
    let serial: SerialTransport;
    beforeEach(() => {
      const cfg: SerialTransportConfig = {
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        type: "serial",
      };
      serial = new SerialTransport(cfg);
    });
    it("postMessage when disconnected", () => {
      expect(() => serial.postMessage(new Uint8Array([1]))).toThrow(
        "Transport not connected",
      );
    });
    it("async send error dispatch", async () => {
      (serial as unknown as { _state: string })._state = "connected";
      const e = new Error("fail");
      vi.spyOn(
        (
          serial as unknown as {
            serialManager: { send: (d: Uint8Array) => Promise<void> };
          }
        ).serialManager,
        "send",
      ).mockRejectedValue(e);
      let got: Error | null = null;
      serial.addEventListener("error", (ev) => {
        got = (ev as CustomEvent<Error>).detail;
      });
      serial.postMessage(new Uint8Array([3]));
      await new Promise((r) => setTimeout(r, 0));
      expect(got).toBe(e);
    });
  });

  it("tcp unsupported connect", async () => {
    const { TcpTransport } = await import("../src/transport/tcp-transport.ts");
    const tcp = new TcpTransport({ host: "localhost", port: 502, type: "tcp" });
    await expect(tcp.connect()).rejects.toThrow("TCP transport not supported");
  });

  it("createTransport helper", () => {
    const t = createTransport({ type: "mock" });
    expect(t).toBeInstanceOf(MockTransport);
  });
});
