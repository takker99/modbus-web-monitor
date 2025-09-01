// Simple tests for individual handler files
// Tests the new modular handler architecture with correct MockTransport usage

import { describe, it, expect, beforeEach } from "vitest";
import { MockTransport } from "../src/transport/mock-transport.ts";
import { ModbusHandlerRegistry } from "../src/handlers/index.ts";
import { readCoils } from "../src/handlers/read-coils.ts";
import { writeSingleCoil } from "../src/handlers/write-single-coil.ts";
import { isOk, isErr } from "../src/types/result.ts";

describe("Individual Handler Files", () => {
  let transport: MockTransport;

  beforeEach(async () => {
    transport = new MockTransport({
      type: "mock",
      autoConnect: true,
      responses: [],
    });
    await transport.connect(); // Explicitly connect for testing
  });

  describe("Handler Registry", () => {
    it("should initialize with all handlers", () => {
      const metadata = ModbusHandlerRegistry.getAllHandlerMetadata();
      expect(metadata).toHaveLength(8);
      
      const functionCodes = metadata.map(m => m.functionCode).sort((a, b) => a - b);
      expect(functionCodes).toEqual([1, 2, 3, 4, 5, 6, 15, 16]);
    });

    it("should correctly identify supported function codes", () => {
      expect(ModbusHandlerRegistry.isSupported(1)).toBe(true);
      expect(ModbusHandlerRegistry.isSupported(99)).toBe(false);
    });

    it("should categorize handlers by type", () => {
      const readHandlers = ModbusHandlerRegistry.getHandlersByType("read");
      const writeHandlers = ModbusHandlerRegistry.getHandlersByType("write");
      
      expect(readHandlers).toHaveLength(4);
      expect(writeHandlers).toHaveLength(4);
    });

    it("should categorize handlers by data type", () => {
      const bitHandlers = ModbusHandlerRegistry.getHandlersByDataType("bit");
      const registerHandlers = ModbusHandlerRegistry.getHandlersByDataType("register");
      
      expect(bitHandlers).toHaveLength(4); // FC01, FC02, FC05, FC15
      expect(registerHandlers).toHaveLength(4); // FC03, FC04, FC06, FC16
    });
  });

  describe("Basic Handler Operation", () => {
    it("should handle read coils (FC01) with valid request", async () => {
      const result = await readCoils(transport, {
        unitId: 1,
        address: 19,
        quantity: 19,
      });

      // Should timeout since no response is provided, but request should be valid
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("timeout");
      }
    });

    it("should handle write single coil (FC05) with valid request", async () => {
      const result = await writeSingleCoil(transport, {
        unitId: 1,
        address: 172,
        value: true,
      });

      // Should timeout since no response is provided, but request should be valid
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("timeout");
      }
    });

    it("should validate read request parameters", async () => {
      // Test invalid quantity for coils
      const result1 = await readCoils(transport, {
        unitId: 1,
        address: 0,
        quantity: 2001, // Too many
      });
      expect(isErr(result1)).toBe(true);
      if (isErr(result1)) {
        expect(result1.error.message).toContain("Invalid quantity");
      }

      // Test invalid address
      const result2 = await readCoils(transport, {
        unitId: 1,
        address: -1, // Invalid
        quantity: 10,
      });
      expect(isErr(result2)).toBe(true);
      if (isErr(result2)) {
        expect(result2.error.message).toContain("Invalid address");
      }
    });

    it("should validate write request parameters", async () => {
      // Test invalid address
      const result = await writeSingleCoil(transport, {
        unitId: 1,
        address: -1, // Invalid
        value: true,
      });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Invalid address");
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle transport disconnection", async () => {
      transport.disconnect();
      
      const result = await readCoils(transport, {
        unitId: 1,
        address: 0,
        quantity: 10,
      });
      
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("not connected");
      }
    });

    it("should handle timeout scenarios", async () => {
      const result = await readCoils(transport, {
        unitId: 1,
        address: 0,
        quantity: 10,
      }, { timeout: 100 }); // Short timeout
      
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("timeout");
      }
    });
  });

  describe("Registry Dynamic Execution", () => {
    it("should execute read operations through registry", async () => {
      const result = await ModbusHandlerRegistry.executeRead(3, transport, {
        unitId: 1,
        address: 0,
        quantity: 2,
      });
      
      // Should timeout but be processed by correct handler
      expect(isErr(result)).toBe(true);
    });

    it("should execute write operations through registry", async () => {
      const result = await ModbusHandlerRegistry.executeWrite(5, transport, {
        unitId: 1,
        address: 172,
        value: true,
      });
      
      // Should timeout but be processed by correct handler
      expect(isErr(result)).toBe(true);
    });

    it("should reject unsupported function codes", async () => {
      const result = await ModbusHandlerRegistry.executeRead(99, transport, {});
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Unsupported function code");
      }
    });

    it("should reject wrong operation type", async () => {
      const result = await ModbusHandlerRegistry.executeRead(5, transport, {});
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("not a read operation");
      }
    });
  });
});