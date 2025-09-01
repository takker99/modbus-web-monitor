// Tests for transport abstraction
import { describe, expect, it, beforeEach, vi } from "vitest";
import { 
  TransportRegistry, 
  SerialTransport, 
  MockTransport, 
  createTransport,
  type SerialTransportConfig,
  type MockTransportConfig 
} from "../src/transport/index.ts";

describe("Transport Abstraction", () => {
  describe("TransportRegistry", () => {
    it("should register and create serial transport", () => {
      const config: SerialTransportConfig = {
        type: "serial",
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      };

      const transport = TransportRegistry.create(config);
      expect(transport).toBeInstanceOf(SerialTransport);
      expect(transport.config).toEqual(config);
      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);
    });

    it("should register and create mock transport", () => {
      const config: MockTransportConfig = {
        type: "mock",
        name: "test-transport",
      };

      const transport = TransportRegistry.create(config);
      expect(transport).toBeInstanceOf(MockTransport);
      expect(transport.config).toEqual(config);
      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);
    });

    it("should throw error for unknown transport type", () => {
      const config = { type: "unknown" } as any;
      expect(() => TransportRegistry.create(config)).toThrow("Unknown transport type: unknown");
    });

    it("should list registered transport types", () => {
      const types = TransportRegistry.getRegisteredTypes();
      expect(types).toContain("serial");
      expect(types).toContain("tcp");
      expect(types).toContain("mock");
    });
  });

  describe("MockTransport", () => {
    let transport: MockTransport;
    let config: MockTransportConfig;

    beforeEach(() => {
      config = {
        type: "mock",
        name: "test-transport",
      };
      transport = new MockTransport(config);
    });

    it("should initialize with correct state", () => {
      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);
      expect(transport.config).toEqual(config);
    });

    it("should connect successfully", async () => {
      const stateChanges: string[] = [];
      transport.on("stateChange", (state) => stateChanges.push(state));

      let connected = false;
      transport.on("connect", () => { connected = true; });

      await transport.connect();

      expect(transport.state).toBe("connected");
      expect(transport.connected).toBe(true);
      expect(connected).toBe(true);
      expect(stateChanges).toEqual(["connecting", "connected"]);
    });

    it("should handle connection failures", async () => {
      const failingTransport = new MockTransport(config, {
        shouldFailConnect: true,
        errorMessage: "Connection failed",
      });

      await expect(failingTransport.connect()).rejects.toThrow("Connection failed");
      expect(failingTransport.state).toBe("error");
    });

    it("should disconnect successfully", async () => {
      await transport.connect();

      let disconnected = false;
      transport.on("disconnect", () => { disconnected = true; });

      await transport.disconnect();

      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);
      expect(disconnected).toBe(true);
    });

    it("should send data and record it", async () => {
      await transport.connect();

      const data = new Uint8Array([1, 3, 0, 0, 0, 10]);
      await transport.send(data);

      expect(transport.getSentDataCount()).toBe(1);
      expect(transport.getLastSentData()).toEqual(data);
    });

    it("should handle send failures", async () => {
      const failingTransport = new MockTransport(config, {
        shouldFailSend: true,
        errorMessage: "Send failed",
      });

      await failingTransport.connect();

      const data = new Uint8Array([1, 3, 0, 0, 0, 10]);
      await expect(failingTransport.send(data)).rejects.toThrow("Send failed");
    });

    it("should emit auto-responses", async () => {
      await transport.connect();

      const request = new Uint8Array([1, 3, 0, 0, 0, 1]);
      const response = new Uint8Array([1, 3, 2, 0x12, 0x34, 0x85, 0xE6]);

      transport.setAutoResponse(request, response);

      let receivedData: Uint8Array | null = null;
      transport.on("data", (data) => { receivedData = data; });

      await transport.send(request);

      // Wait for async response
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedData).toEqual(response);
    });

    it("should simulate errors and disconnections", async () => {
      await transport.connect();

      let errorReceived: Error | null = null;
      transport.on("error", (error) => { errorReceived = error; });

      const testError = new Error("Simulated error");
      transport.simulateError(testError);

      expect(transport.state).toBe("error");
      expect(errorReceived).toBe(testError);

      // Reset to connected state
      transport["_state"] = "connected";

      let disconnected = false;
      transport.on("disconnect", () => { disconnected = true; });

      transport.simulateDisconnect();
      expect(transport.state).toBe("disconnected");
      expect(disconnected).toBe(true);
    });

    it("should simulate data reception", async () => {
      await transport.connect();

      let receivedData: Uint8Array | null = null;
      transport.on("data", (data) => { receivedData = data; });

      const testData = new Uint8Array([1, 3, 2, 0x12, 0x34]);
      transport.simulateData(testData);

      expect(receivedData).toEqual(testData);
    });

    it("should clear sent data and auto-responses", async () => {
      await transport.connect();

      const data = new Uint8Array([1, 2, 3]);
      await transport.send(data);

      expect(transport.getSentDataCount()).toBe(1);

      transport.clearSentData();
      expect(transport.getSentDataCount()).toBe(0);

      transport.setAutoResponse(data, new Uint8Array([4, 5, 6]));
      transport.clearAutoResponses();
      
      // Should not emit response after clearing
      let receivedData: Uint8Array | null = null;
      transport.on("data", (data) => { receivedData = data; });
      
      await transport.send(data);
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(receivedData).toBeNull();
    });
  });

  describe("SerialTransport", () => {
    let transport: SerialTransport;
    let config: SerialTransportConfig;

    beforeEach(() => {
      config = {
        type: "serial",
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      };
      transport = new SerialTransport(config);
    });

    it("should initialize with correct state", () => {
      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);
      expect(transport.config).toEqual(config);
    });

    it("should handle connect when already connected", async () => {
      // Mock the internal state to simulate already connected
      (transport as any)._state = "connected";
      
      // Should return without doing anything
      await transport.connect();
      expect(transport.state).toBe("connected");
    });

    it("should handle disconnect when already disconnected", async () => {
      expect(transport.state).toBe("disconnected");
      
      // Should return without doing anything  
      await transport.disconnect();
      expect(transport.state).toBe("disconnected");
    });

    it("should throw error when sending while not connected", async () => {
      const data = new Uint8Array([1, 2, 3]);
      
      await expect(transport.send(data)).rejects.toThrow("Transport not connected");
    });

    it("should handle send errors when connected", async () => {
      // Mock as connected
      (transport as any)._state = "connected";
      
      // Mock serialManager to throw error on send
      const mockError = new Error("Send failed");
      vi.spyOn((transport as any).serialManager, "send").mockRejectedValue(mockError);
      
      let errorEmitted: Error | null = null;
      transport.on("error", (error) => { errorEmitted = error; });
      
      const data = new Uint8Array([1, 2, 3]);
      await expect(transport.send(data)).rejects.toThrow("Send failed");
      expect(errorEmitted).toBe(mockError);
    });

    it("should emit stateChange events", () => {
      const stateChanges: string[] = [];
      transport.on("stateChange", (state) => stateChanges.push(state));
      
      // Trigger state change via private method
      (transport as any).setState("connecting");
      (transport as any).setState("connected");
      (transport as any).setState("error");
      
      expect(stateChanges).toEqual(["connecting", "connected", "error"]);
    });

    it("should not emit stateChange when state doesn't change", () => {
      let stateChangeCount = 0;
      transport.on("stateChange", () => stateChangeCount++);
      
      // Set same state multiple times
      (transport as any).setState("disconnected");
      (transport as any).setState("disconnected");
      
      expect(stateChangeCount).toBe(0);
    });

    it("should handle serialManager connected event", () => {
      let connectEmitted = false;
      transport.on("connect", () => { connectEmitted = true; });
      
      // Trigger serialManager connected event
      (transport as any).serialManager.emit("connected");
      
      expect(transport.state).toBe("connected");
      expect(connectEmitted).toBe(true);
    });

    it("should handle serialManager disconnected event", () => {
      // Set to connected first
      (transport as any)._state = "connected";
      
      let disconnectEmitted = false;
      transport.on("disconnect", () => { disconnectEmitted = true; });
      
      // Trigger serialManager disconnected event
      (transport as any).serialManager.emit("disconnected");
      
      expect(transport.state).toBe("disconnected");
      expect(disconnectEmitted).toBe(true);
    });

    it("should handle serialManager portDisconnected event", () => {
      // Set to connected first
      (transport as any)._state = "connected";
      
      let disconnectEmitted = false;
      transport.on("disconnect", () => { disconnectEmitted = true; });
      
      // Trigger serialManager portDisconnected event
      (transport as any).serialManager.emit("portDisconnected");
      
      expect(transport.state).toBe("disconnected");
      expect(disconnectEmitted).toBe(true);
    });

    it("should handle serialManager error event", () => {
      const testError = new Error("Serial error");
      let errorEmitted: Error | null = null;
      transport.on("error", (error) => { errorEmitted = error; });
      
      // Trigger serialManager error event
      (transport as any).serialManager.emit("error", testError);
      
      expect(transport.state).toBe("error");
      expect(errorEmitted).toBe(testError);
    });

    it("should handle serialManager data event", () => {
      const testData = new Uint8Array([1, 2, 3, 4]);
      let dataEmitted: Uint8Array | null = null;
      transport.on("data", (data) => { dataEmitted = data; });
      
      // Trigger serialManager data event
      (transport as any).serialManager.emit("data", testData);
      
      expect(dataEmitted).toEqual(testData);
    });

    it("should handle reconnect when already connected", async () => {
      // Set to connected first
      (transport as any)._state = "connected";
      
      // Mock serialManager methods
      const disconnectSpy = vi.spyOn((transport as any).serialManager, "disconnect").mockResolvedValue(undefined);
      const reconnectSpy = vi.spyOn((transport as any).serialManager, "reconnect").mockResolvedValue(undefined);
      
      await transport.reconnect();
      
      expect(disconnectSpy).toHaveBeenCalled();
      expect(reconnectSpy).toHaveBeenCalledWith({
        baudRate: 9600,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
      });
    });

    it("should handle reconnect errors", async () => {
      const mockError = new Error("Reconnect failed");
      vi.spyOn((transport as any).serialManager, "reconnect").mockRejectedValue(mockError);
      
      await expect(transport.reconnect()).rejects.toThrow("Reconnect failed");
      expect(transport.state).toBe("error");
    });

    it("should handle connect errors", async () => {
      const mockError = new Error("Connect failed");
      vi.spyOn((transport as any).serialManager, "selectPort").mockRejectedValue(mockError);
      
      await expect(transport.connect()).rejects.toThrow("Connect failed");
      expect(transport.state).toBe("error");
    });

    it("should handle disconnect errors", async () => {
      // Set to connected first
      (transport as any)._state = "connected";
      
      const mockError = new Error("Disconnect failed");
      vi.spyOn((transport as any).serialManager, "disconnect").mockRejectedValue(mockError);
      
      await expect(transport.disconnect()).rejects.toThrow("Disconnect failed");
      expect(transport.state).toBe("error");
    });
  });

  describe("TcpTransport", () => {
    let transport: any; // Using any since TcpTransport is imported differently

    beforeEach(async () => {
      const { TcpTransport } = await import("../src/transport/tcp-transport.ts");
      const config = {
        type: "tcp" as const,
        host: "localhost",
        port: 502,
      };
      transport = new TcpTransport(config);
    });

    it("should initialize with correct state", () => {
      expect(transport.state).toBe("disconnected");
      expect(transport.connected).toBe(false);
    });

    it("should handle connect when already connected", async () => {
      transport._state = "connected";
      
      await transport.connect();
      expect(transport.state).toBe("connected");
    });

    it("should throw error on connect (browser limitation)", async () => {
      await expect(transport.connect()).rejects.toThrow(
        "TCP transport not supported in browser environment"
      );
      expect(transport.state).toBe("error");
    });

    it("should handle disconnect when already disconnected", async () => {
      expect(transport.state).toBe("disconnected");
      
      await transport.disconnect();
      expect(transport.state).toBe("disconnected");
    });

    it("should handle disconnect with socket", async () => {
      // Mock socket
      const mockSocket = {
        close: vi.fn(),
      };
      transport.socket = mockSocket;
      transport._state = "connected";
      
      let disconnectEmitted = false;
      transport.on("disconnect", () => { disconnectEmitted = true; });
      
      await transport.disconnect();
      
      expect(mockSocket.close).toHaveBeenCalled();
      expect(transport.socket).toBeNull();
      expect(transport.state).toBe("disconnected");
      expect(disconnectEmitted).toBe(true);
    });

    it("should handle disconnect errors", async () => {
      transport._state = "connected";
      const mockSocket = {
        close: vi.fn(() => { throw new Error("Close failed"); }),
      };
      transport.socket = mockSocket;
      
      await expect(transport.disconnect()).rejects.toThrow("Close failed");
      expect(transport.state).toBe("error");
    });

    it("should throw error when sending while not connected", async () => {
      const data = new Uint8Array([1, 2, 3]);
      
      await expect(transport.send(data)).rejects.toThrow("Transport not connected");
    });

    it("should throw error when sending without socket", async () => {
      transport._state = "connected";
      transport.socket = null;
      
      const data = new Uint8Array([1, 2, 3]);
      
      await expect(transport.send(data)).rejects.toThrow("No socket connection");
    });

    it("should send data successfully", async () => {
      transport._state = "connected";
      const mockSocket = {
        send: vi.fn(),
      };
      transport.socket = mockSocket;
      
      const data = new Uint8Array([1, 2, 3]);
      await transport.send(data);
      
      expect(mockSocket.send).toHaveBeenCalledWith(data);
    });

    it("should handle send errors", async () => {
      transport._state = "connected";
      const mockError = new Error("Send failed");
      const mockSocket = {
        send: vi.fn(() => { throw mockError; }),
      };
      transport.socket = mockSocket;
      
      let errorEmitted: Error | null = null;
      transport.on("error", (error: Error) => { errorEmitted = error; });
      
      const data = new Uint8Array([1, 2, 3]);
      await expect(transport.send(data)).rejects.toThrow("Send failed");
      expect(errorEmitted).toBe(mockError);
    });

    it("should emit stateChange events", () => {
      const stateChanges: string[] = [];
      transport.on("stateChange", (state: string) => stateChanges.push(state));
      
      transport.setState("connecting");
      transport.setState("connected");
      transport.setState("error");
      
      expect(stateChanges).toEqual(["connecting", "connected", "error"]);
    });

    it("should not emit stateChange when state doesn't change", () => {
      let stateChangeCount = 0;
      transport.on("stateChange", () => stateChangeCount++);
      
      transport.setState("disconnected");
      transport.setState("disconnected");
      
      expect(stateChangeCount).toBe(0);
    });
  });

  describe("createTransport convenience function", () => {
    it("should create transport using convenience function", () => {
      const config: MockTransportConfig = {
        type: "mock",
        name: "convenience-test",
      };

      const transport = createTransport(config);
      expect(transport).toBeInstanceOf(MockTransport);
      expect(transport.config).toEqual(config);
    });
  });
});