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