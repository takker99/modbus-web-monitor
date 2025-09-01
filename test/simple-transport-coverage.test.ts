// Simple coverage tests for transport functionality
import { describe, expect, it, vi } from "vitest";
import { SerialTransport, TcpTransport, type SerialTransportConfig, type TcpTransportConfig } from "../src/transport/index.ts";

describe("Transport Coverage", () => {
  describe("SerialTransport additional coverage", () => {
    it("should handle state management", () => {
      const config: SerialTransportConfig = {
        type: "serial",
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      };
      
      const transport = new SerialTransport(config);
      
      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);
      
      // Test state change mechanism
      (transport as any).setState("connecting");
      expect(transport.state).toBe("connecting");
      expect(transport.connected).toBe(false);
      
      (transport as any).setState("connected");
      expect(transport.state).toBe("connected");
      expect(transport.connected).toBe(true);
    });

    it("should handle serial manager events", () => {
      const config: SerialTransportConfig = {
        type: "serial",
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      };
      
      const transport = new SerialTransport(config);
      let connectEmitted = false;
      let disconnectEmitted = false;
      let errorEmitted: Error | null = null;
      let dataEmitted: Uint8Array | null = null;
      
      transport.on("connect", () => { connectEmitted = true; });
      transport.on("disconnect", () => { disconnectEmitted = true; });
      transport.on("error", (error) => { errorEmitted = error; });
      transport.on("data", (data) => { dataEmitted = data; });
      
      // Simulate serial manager events
      (transport as any).serialManager.emit("connected");
      expect(connectEmitted).toBe(true);
      expect(transport.state).toBe("connected");
      
      (transport as any).serialManager.emit("disconnected");
      expect(disconnectEmitted).toBe(true);
      expect(transport.state).toBe("disconnected");
      
      const testError = new Error("Test error");
      (transport as any).serialManager.emit("error", testError);
      expect(errorEmitted).toBe(testError);
      expect(transport.state).toBe("error");
      
      const testData = new Uint8Array([1, 2, 3]);
      (transport as any).serialManager.emit("data", testData);
      expect(dataEmitted).toEqual(testData);
    });

    it("should handle reconnect scenarios", async () => {
      const config: SerialTransportConfig = {
        type: "serial",
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      };
      
      const transport = new SerialTransport(config);
      
      // Mock serial manager methods
      const disconnectSpy = vi.spyOn((transport as any).serialManager, "disconnect").mockResolvedValue(undefined);
      const reconnectSpy = vi.spyOn((transport as any).serialManager, "reconnect").mockResolvedValue(undefined);
      
      // Set initial state to connected
      (transport as any)._state = "connected";
      
      await transport.reconnect();
      
      expect(disconnectSpy).toHaveBeenCalled();
      expect(reconnectSpy).toHaveBeenCalledWith({
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      });
    });

    it("should handle actual connect process", async () => {
      const config: SerialTransportConfig = {
        type: "serial",
        baudRate: 19200,
        dataBits: 7,
        parity: "even",
        stopBits: 2,
      };
      
      const transport = new SerialTransport(config);
      
      // Mock serial manager methods to exercise the actual connect path
      const selectPortSpy = vi.spyOn((transport as any).serialManager, "selectPort").mockResolvedValue(undefined);
      const connectSpy = vi.spyOn((transport as any).serialManager, "connect").mockResolvedValue(undefined);
      
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
        type: "tcp",
        host: "localhost",
        port: 502,
      };
      
      const transport = new TcpTransport(config);
      
      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);
      
      // Should throw error on connect
      await expect(transport.connect()).rejects.toThrow("TCP transport not supported");
      expect(transport.state).toBe("error");
    });

    it("should handle disconnect with socket", async () => {
      const config: TcpTransportConfig = {
        type: "tcp",
        host: "localhost",
        port: 502,
      };
      
      const transport = new TcpTransport(config);
      
      // Mock a socket
      const mockSocket = {
        close: vi.fn(),
      };
      
      (transport as any).socket = mockSocket;
      (transport as any)._state = "connected";
      
      let disconnectEmitted = false;
      transport.on("disconnect", () => { disconnectEmitted = true; });
      
      await transport.disconnect();
      
      expect(mockSocket.close).toHaveBeenCalled();
      expect((transport as any).socket).toBeNull();
      expect(transport.state).toBe("disconnected");
      expect(disconnectEmitted).toBe(true);
    });

    it("should handle send operations", async () => {
      const config: TcpTransportConfig = {
        type: "tcp",
        host: "localhost",
        port: 502,
      };
      
      const transport = new TcpTransport(config);
      
      // Test send when not connected
      const data = new Uint8Array([1, 2, 3]);
      await expect(transport.send(data)).rejects.toThrow("Transport not connected");
      
      // Test send when connected but no socket
      (transport as any)._state = "connected";
      (transport as any).socket = null;
      await expect(transport.send(data)).rejects.toThrow("No socket connection");
      
      // Test successful send
      const mockSocket = {
        send: vi.fn(),
      };
      (transport as any).socket = mockSocket;
      
      await transport.send(data);
      expect(mockSocket.send).toHaveBeenCalledWith(data);
      
      // Test send error
      const sendError = new Error("Send failed");
      mockSocket.send.mockImplementation(() => { throw sendError; });
      
      let errorEmitted: Error | null = null;
      transport.on("error", (error) => { errorEmitted = error; });
      
      await expect(transport.send(data)).rejects.toThrow("Send failed");
      expect(errorEmitted).toBe(sendError);
    });
  });
});