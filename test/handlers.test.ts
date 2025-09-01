// Tests for individual handler files
// Tests the new modular handler architecture

import { describe, it, expect, beforeEach } from "vitest";
import { MockTransport } from "../src/transport/mock-transport.ts";
import { ModbusHandlerRegistry } from "../src/handlers/index.ts";
import { readCoils } from "../src/handlers/read-coils.ts";
import { readDiscreteInputs } from "../src/handlers/read-discrete-inputs.ts";
import { readHoldingRegisters } from "../src/handlers/read-holding-registers.ts";
import { readInputRegisters } from "../src/handlers/read-input-registers.ts";
import { writeSingleCoil } from "../src/handlers/write-single-coil.ts";
import { writeSingleRegister } from "../src/handlers/write-single-register.ts";
import { writeMultipleCoils } from "../src/handlers/write-multiple-coils.ts";
import { writeMultipleRegisters } from "../src/handlers/write-multiple-registers.ts";
import { isOk, isErr } from "../src/types/result.ts";

describe("Individual Handler Files", () => {
  let transport: MockTransport;

  beforeEach(() => {
    transport = new MockTransport({
      type: "mock",
      autoConnect: true,
      responses: [],
    });
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

  describe("Read Handlers", () => {
    it("should read coils (FC01)", async () => {
      // Mock response: 2 bytes of coil data
      const mockResponse = new Uint8Array([0x01, 0x01, 0x02, 0xCD, 0x6B, 0xA2, 0x13]);
      
      const result = await readCoils(transport, {
        unitId: 1,
        address: 19,
        quantity: 19,
      });

      // Simulate response after request is sent
      setTimeout(() => transport.simulateData(mockResponse), 10);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.functionCode).toBe(1);
        expect(result.data.slaveId).toBe(1);
        expect(result.data.data).toHaveLength(19);
      }
    });

    it("should read discrete inputs (FC02)", async () => {
      // Mock response: 3 bytes of discrete input data
      const mockResponse = new Uint8Array([0x01, 0x02, 0x03, 0xAC, 0xDB, 0x35, 0x20, 0x18]);
      
      const resultPromise = readDiscreteInputs(transport, {
        unitId: 1,
        address: 196,
        quantity: 22,
      });

      // Simulate response after request is sent
      setTimeout(() => transport.simulateData(mockResponse), 10);
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.functionCode).toBe(2);
        expect(result.data.slaveId).toBe(1);
        expect(result.data.data).toHaveLength(22);
      }
    });

    it("should read holding registers (FC03)", async () => {
      // Mock response: 2 registers worth of data
      const mockResponse = new Uint8Array([0x01, 0x03, 0x04, 0x00, 0x0A, 0x00, 0x08, 0xF4, 0x03]);
      
      const resultPromise = readHoldingRegisters(transport, {
        unitId: 1,
        address: 40001,
        quantity: 2,
      });

      // Simulate response after request is sent
      setTimeout(() => transport.simulateData(mockResponse), 10);
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.functionCode).toBe(3);
        expect(result.data.slaveId).toBe(1);
        expect(result.data.data).toEqual([10, 8]);
      }
    });

    it("should read input registers (FC04)", async () => {
      // Mock response: 1 register worth of data
      const mockResponse = new Uint8Array([0x01, 0x04, 0x02, 0x00, 0x0A, 0xF8, 0xF4]);
      
      const resultPromise = readInputRegisters(transport, {
        unitId: 1,
        address: 30001,
        quantity: 1,
      });

      // Simulate response after request is sent
      setTimeout(() => transport.simulateData(mockResponse), 10);
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.functionCode).toBe(4);
        expect(result.data.slaveId).toBe(1);
        expect(result.data.data).toEqual([10]);
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

      // Test invalid quantity for registers
      const result2 = await readHoldingRegisters(transport, {
        unitId: 1,
        address: 0,
        quantity: 126, // Too many
      });
      expect(isErr(result2)).toBe(true);

      // Test invalid address
      const result3 = await readCoils(transport, {
        unitId: 1,
        address: -1, // Invalid
        quantity: 10,
      });
      expect(isErr(result3)).toBe(true);
    });
  });

  describe("Write Handlers", () => {
    it("should write single coil (FC05)", async () => {
      // Mock response: echo back the request
      transport.setMockResponse([0x01, 0x05, 0x00, 0xAC, 0xFF, 0x00, 0x4E, 0x8B]);
      
      const result = await writeSingleCoil(transport, {
        unitId: 1,
        address: 172,
        value: true,
      });

      expect(isOk(result)).toBe(true);
    });

    it("should write single register (FC06)", async () => {
      // Mock response: echo back the request
      transport.setMockResponse([0x01, 0x06, 0x00, 0x01, 0x00, 0x03, 0x9A, 0x9B]);
      
      const result = await writeSingleRegister(transport, {
        unitId: 1,
        address: 1,
        value: 3,
      });

      expect(isOk(result)).toBe(true);
    });

    it("should write multiple coils (FC15)", async () => {
      // Mock response: address and quantity confirmation
      transport.setMockResponse([0x01, 0x0F, 0x00, 0x13, 0x00, 0x0A, 0x26, 0x99]);
      
      const result = await writeMultipleCoils(transport, {
        unitId: 1,
        address: 19,
        values: [true, false, true, true, false, false, true, false, true, true],
      });

      expect(isOk(result)).toBe(true);
    });

    it("should write multiple registers (FC16)", async () => {
      // Mock response: address and quantity confirmation
      transport.setMockResponse([0x01, 0x10, 0x00, 0x01, 0x00, 0x02, 0x12, 0x98]);
      
      const result = await writeMultipleRegisters(transport, {
        unitId: 1,
        address: 1,
        values: [10, 258],
      });

      expect(isOk(result)).toBe(true);
    });

    it("should validate write request parameters", async () => {
      // Test invalid coil array
      const result1 = await writeMultipleCoils(transport, {
        unitId: 1,
        address: 0,
        values: [], // Empty array
      });
      expect(isErr(result1)).toBe(true);

      // Test too many coils
      const result2 = await writeMultipleCoils(transport, {
        unitId: 1,
        address: 0,
        values: new Array(1969).fill(true), // Too many
      });
      expect(isErr(result2)).toBe(true);

      // Test too many registers
      const result3 = await writeMultipleRegisters(transport, {
        unitId: 1,
        address: 0,
        values: new Array(124).fill(0), // Too many
      });
      expect(isErr(result3)).toBe(true);

      // Test invalid register value
      const result4 = await writeMultipleRegisters(transport, {
        unitId: 1,
        address: 0,
        values: [65536], // Too large
      });
      expect(isErr(result4)).toBe(true);
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

    it("should handle exception responses", async () => {
      // Mock exception response (function code | 0x80, exception code)
      transport.setMockResponse([0x01, 0x81, 0x02, 0x90, 0x2B]); // Illegal data address
      
      const result = await readCoils(transport, {
        unitId: 1,
        address: 0,
        quantity: 10,
      });
      
      expect(isErr(result)).toBe(true);
    });

    it("should handle timeout scenarios", async () => {
      // Don't set any mock response to simulate timeout
      
      const result = await readCoils(transport, {
        unitId: 1,
        address: 0,
        quantity: 10,
      }, { timeout: 100 }); // Short timeout
      
      expect(isErr(result)).toBe(true);
    });
  });

  describe("Registry Dynamic Execution", () => {
    it("should execute read operations through registry", async () => {
      transport.setMockResponse([0x01, 0x03, 0x04, 0x00, 0x0A, 0x00, 0x08, 0xF4, 0x03]);
      
      const result = await ModbusHandlerRegistry.executeRead(3, transport, {
        unitId: 1,
        address: 0,
        quantity: 2,
      });
      
      expect(isOk(result)).toBe(true);
    });

    it("should execute write operations through registry", async () => {
      transport.setMockResponse([0x01, 0x05, 0x00, 0xAC, 0xFF, 0x00, 0x4E, 0x8B]);
      
      const result = await ModbusHandlerRegistry.executeWrite(5, transport, {
        unitId: 1,
        address: 172,
        value: true,
      });
      
      expect(isOk(result)).toBe(true);
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