// Minimal additional coverage for edge cases
import { describe, expect, it } from "vitest";
import { createTransport, TransportRegistry } from "../src/transport/index.ts";

describe("Final Coverage", () => {
  describe("TransportRegistry coverage", () => {
    it("should handle TCP transport creation", () => {
      const tcpConfig = {
        type: "tcp" as const,
        host: "localhost",
        port: 502,
      };
      
      const transport = TransportRegistry.create(tcpConfig);
      expect(transport).toBeDefined();
      expect(transport.config).toEqual(tcpConfig);
    });

    it("should use createTransport helper for TCP", () => {
      const tcpConfig = {
        type: "tcp" as const,
        host: "localhost",
        port: 502,
      };
      
      const transport = createTransport(tcpConfig);
      expect(transport).toBeDefined();
      expect(transport.config).toEqual(tcpConfig);
    });

    it("should handle unknown transport types with more coverage", () => {
      const invalidConfig = {
        type: "websocket" as any,
        url: "ws://localhost:8080",
      };
      
      expect(() => TransportRegistry.create(invalidConfig)).toThrow("Unknown transport type: websocket");
    });
  });

  describe("Error handling edge cases", () => {
    it("should exercise more error paths", async () => {
      const { ModbusFrameError, ModbusCRCError, ModbusLRCError } = await import("../src/errors.ts");
      
      // Create instances to exercise constructors
      const frameError = new ModbusFrameError("Test frame error");
      expect(frameError.message).toBe("Frame error: Test frame error");
      
      const crcError = new ModbusCRCError();
      expect(crcError.message).toBe("CRC error");
      
      const lrcError = new ModbusLRCError();
      expect(lrcError.message).toBe("LRC error");
    });
  });

  describe("Index file coverage", () => {
    it("should handle missing transport cases in index", async () => {
      const { TcpTransport } = await import("../src/transport/tcp-transport.ts");
      const { createTransport } = await import("../src/transport/index.ts");
      
      // Just exercise the import path
      expect(TcpTransport).toBeDefined();
      
      // Test the index file's createTransport with serial
      const serialConfig = {
        type: "serial" as const,
        baudRate: 9600,
        dataBits: 8,
        parity: "none" as const,
        stopBits: 1,
      };
      
      const serialTransport = createTransport(serialConfig);
      expect(serialTransport).toBeDefined();
    });
  });
});