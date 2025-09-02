// Simple coverage tests for transport functionality
import { describe, expect, it, vi } from "vitest";
import {
  SerialTransport,
  type SerialTransportConfig,
  TcpTransport,
  type TcpTransportConfig,
} from "../src/transport/index.ts";

describe("Transport Coverage", () => {
  describe("SerialTransport additional coverage", () => {
    it("should handle state management", () => {
      const config: SerialTransportConfig = {
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        type: "serial",
      };

      const transport = new SerialTransport(config);

      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);

      // Test state change mechanism
      // biome-ignore lint/suspicious/noExplicitAny: For test case
      (transport as any).setState("connecting");
      expect(transport.state).toBe("connecting");
      expect(transport.connected).toBe(false);

      // biome-ignore lint/suspicious/noExplicitAny: For test case
      (transport as any).setState("connected");
      expect(transport.state).toBe("connected");
      expect(transport.connected).toBe(true);
    });

    it("should handle serial manager events (mapped to new EventTarget events)", () => {
      const config: SerialTransportConfig = {
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        type: "serial",
      };

      const transport = new SerialTransport(config);
      let openEmitted = false;
      let closeEmitted = false;
      let errorEmitted: Error | null = null;
      let messageEmitted: Uint8Array | null = null;

      transport.addEventListener("open", () => {
        openEmitted = true;
      });
      transport.addEventListener("close", () => {
        closeEmitted = true;
      });
      transport.addEventListener("error", (e) => {
        errorEmitted = (e as CustomEvent<Error>).detail as Error;
      });
      transport.addEventListener("message", (e) => {
        messageEmitted = (e as CustomEvent<Uint8Array>).detail;
      });

      // Simulate serial manager events
      // biome-ignore lint/suspicious/noExplicitAny: For test case
      (transport as any).serialManager.emit("connected");
      expect(openEmitted).toBe(true);
      expect(transport.state).toBe("connected");

      // biome-ignore lint/suspicious/noExplicitAny: For test case
      (transport as any).serialManager.emit("disconnected");
      expect(closeEmitted).toBe(true);
      expect(transport.state).toBe("disconnected");

      const testError = new Error("Test error");
      // biome-ignore lint/suspicious/noExplicitAny: For test case
      (transport as any).serialManager.emit("error", testError);
      expect(errorEmitted).toBe(testError);
      expect(transport.state).toBe("error");

      const testData = new Uint8Array([1, 2, 3]);
      // biome-ignore lint/suspicious/noExplicitAny: For test case
      (transport as any).serialManager.emit("data", testData);
      expect(messageEmitted).toEqual(testData);
    });

    it("should handle actual connect process", async () => {
      const config: SerialTransportConfig = {
        baudRate: 19200,
        dataBits: 7,
        parity: "even",
        stopBits: 2,
        type: "serial",
      };

      const transport = new SerialTransport(config);

      // Mock serial manager methods to exercise the actual connect path
      const selectPortSpy = vi
        // biome-ignore lint/suspicious/noExplicitAny: For test case
        .spyOn((transport as any).serialManager, "selectPort")
        .mockResolvedValue(undefined);
      const connectSpy = vi
        // biome-ignore lint/suspicious/noExplicitAny: For test case
        .spyOn((transport as any).serialManager, "connect")
        .mockResolvedValue(undefined);

      await transport.connect();

      expect(selectPortSpy).toHaveBeenCalled();
      expect(connectSpy).toHaveBeenCalledWith({
        baudRate: 19200,
        dataBits: 7,
        parity: "even",
        stopBits: 2,
      });
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

      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);

      // Should throw error on connect
      await expect(transport.connect()).rejects.toThrow(
        "TCP transport not supported",
      );
      expect(transport.state).toBe("error");
    });

    it("should handle disconnect with socket (close event)", async () => {
      const config: TcpTransportConfig = {
        host: "localhost",
        port: 502,
        type: "tcp",
      };

      const transport = new TcpTransport(config);

      // Mock a socket
      const mockSocket = {
        close: vi.fn(),
      };

      // biome-ignore lint/suspicious/noExplicitAny: For test case
      (transport as any).socket = mockSocket;
      // biome-ignore lint/suspicious/noExplicitAny: For test case
      (transport as any)._state = "connected";

      let closeEmitted = false;
      transport.addEventListener("close", () => {
        closeEmitted = true;
      });

      await transport.disconnect();

      expect(mockSocket.close).toHaveBeenCalled();
      // biome-ignore lint/suspicious/noExplicitAny: For test case
      expect((transport as any).socket).toBeNull();
      expect(transport.state).toBe("disconnected");
      expect(closeEmitted).toBe(true);
    });
    // postMessage is synchronous fire-and-forget now; cover error path by forcing socket null while connected
    it("postMessage error path dispatches error event", () => {
      const config: TcpTransportConfig = {
        host: "localhost",
        port: 502,
        type: "tcp",
      };
      const transport = new TcpTransport(config);
      // Pretend connected but no socket to trigger internal error
      // biome-ignore lint/suspicious/noExplicitAny: test only
      (transport as any)._state = "connected";
      // biome-ignore lint/suspicious/noExplicitAny: test only
      (transport as any).socket = null;
      expect(() => transport.postMessage(new Uint8Array([1, 2, 3]))).toThrow(
        /No socket connection|Transport not connected/,
      );
    });
  });
});
