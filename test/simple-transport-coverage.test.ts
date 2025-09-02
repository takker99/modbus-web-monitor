// Simple coverage tests for transport functionality
import { describe, expect, it } from "vitest";
import { SerialTransport } from "../src/transport/serial-transport.ts";
import { TcpTransport } from "../src/transport/tcp-transport.ts";
import type {
  SerialTransportConfig,
  TcpTransportConfig,
} from "../src/transport/transport.ts";
import { MockSerialPort } from "./mock-serial-port.ts";

describe("Transport Coverage", () => {
  describe("SerialTransport additional coverage", () => {
    it("connect then reader emits one message", async () => {
      const config: SerialTransportConfig = {
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        type: "serial",
      };

      const transport = new SerialTransport(config, new MockSerialPort());
      let messageEmitted: Uint8Array | null = null;
      transport.addEventListener("message", (e) => {
        messageEmitted = (e as CustomEvent<Uint8Array>).detail;
      });
      await transport.connect();
      expect(transport.connected).toBe(true);
      await new Promise((r) => setTimeout(r, 15));
      expect(messageEmitted).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("connect twice is idempotent and leaves state connected", async () => {
      const config: SerialTransportConfig = {
        baudRate: 19200,
        dataBits: 7,
        parity: "even",
        stopBits: 2,
        type: "serial",
      };

      const transport = new SerialTransport(config, new MockSerialPort());
      await transport.connect();
      expect(transport.connected).toBe(true);
      await transport.connect();
      expect(transport.connected).toBe(true);
    });
  });

  describe("TcpTransport additional coverage", () => {
    it("should handle basic error cases", async () => {
      const config: TcpTransportConfig = {
        host: "localhost",
        port: 502,
        type: "tcp",
      };

      const transport = new TcpTransport(config);

      expect(transport.connected).toBe(false);
      await expect(transport.connect()).rejects.toThrow(
        /TCP transport not supported/,
      );
    });

    it("disconnect no-op when never connected", async () => {
      const config: TcpTransportConfig = {
        host: "localhost",
        port: 502,
        type: "tcp",
      };

      const transport = new TcpTransport(config);
      await transport.disconnect(); // should not throw
      expect(transport.connected).toBe(false);
    });
    it("postMessage always throws (unsupported)", () => {
      const config: TcpTransportConfig = {
        host: "localhost",
        port: 502,
        type: "tcp",
      };
      const transport = new TcpTransport(config);
      expect(() => transport.postMessage(new Uint8Array([1, 2, 3]))).toThrow(
        /TCP transport not connected/,
      );
    });
  });
});
