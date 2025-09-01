import { describe, expect, it } from "vitest";
import { calculateCRC16 } from "../src/crc.ts";
import { calculateLRC } from "../src/lrc.ts";
import { ModbusASCIIClient, ModbusRTUClient } from "../src/modbus.ts";

describe("Protocol-specific clients", () => {
  describe("ModbusRTUClient", () => {
    it("should have rtu protocol", () => {
      const client = new ModbusRTUClient();
      expect(client.protocol).toBe("rtu");
    });

    it("should handle RTU response correctly", async () => {
      const client = new ModbusRTUClient();
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      });

      // RTU frame: slave=1, fc=3, bytes=2, data=0x1234
      const frame = [1, 3, 2, 0x12, 0x34];
      const crc = calculateCRC16(frame);
      frame.push(crc & 0xff, (crc >> 8) & 0xff);

      client.handleResponse(new Uint8Array(frame));

      const response = await promise;
      expect(response.data).toEqual([0x1234]);
      expect(response.functionCode).toBe(3);
      expect(response.slaveId).toBe(1);
    });

    it("should be tree-shakable (only RTU imports)", () => {
      // This test verifies that we can import only RTU client
      const client = new ModbusRTUClient();
      expect(client).toBeInstanceOf(ModbusRTUClient);
      expect(client.protocol).toBe("rtu");
    });
  });

  describe("ModbusASCIIClient", () => {
    it("should have ascii protocol", () => {
      const client = new ModbusASCIIClient();
      expect(client.protocol).toBe("ascii");
    });

    it("should handle ASCII response correctly", async () => {
      const client = new ModbusASCIIClient();
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      });

      // ASCII frame: slave=01, fc=03, bytes=02, data=1234
      const messageBytes = [0x01, 0x03, 0x02, 0x12, 0x34];
      const lrc = calculateLRC(messageBytes);
      const hexString =
        messageBytes
          .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
          .join("") + lrc.toString(16).padStart(2, "0").toUpperCase();
      const responseFrame = `:${hexString}\r\n`;

      client.handleResponse(
        new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0))),
      );

      const response = await promise;
      expect(response.data).toEqual([0x1234]);
      expect(response.functionCode).toBe(3);
      expect(response.slaveId).toBe(1);
    });

    it("should be tree-shakable (only ASCII imports)", () => {
      // This test verifies that we can import only ASCII client
      const client = new ModbusASCIIClient();
      expect(client).toBeInstanceOf(ModbusASCIIClient);
      expect(client.protocol).toBe("ascii");
    });
  });

  describe("Backward compatibility", () => {
    it("should maintain the same API for the main ModbusClient", async () => {
      const { ModbusClient } = await import("../src/modbus.ts");
      const client = new ModbusClient();

      // Test protocol switching
      client.protocol = "rtu";
      expect(client.protocol).toBe("rtu");

      client.protocol = "ascii";
      expect(client.protocol).toBe("ascii");

      // Test that methods exist and are callable
      expect(typeof client.read).toBe("function");
      expect(typeof client.write).toBe("function");
      expect(typeof client.startMonitoring).toBe("function");
      expect(typeof client.stopMonitoring).toBe("function");
      expect(typeof client.handleResponse).toBe("function");
    });

    it("should delegate correctly to protocol-specific clients", async () => {
      const { ModbusClient } = await import("../src/modbus.ts");
      const client = new ModbusClient();

      // Test RTU delegation
      client.protocol = "rtu";
      const rtuPromise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      });

      // RTU frame
      const rtuFrame = [1, 3, 2, 0x12, 0x34];
      const crc = calculateCRC16(rtuFrame);
      rtuFrame.push(crc & 0xff, (crc >> 8) & 0xff);

      client.handleResponse(new Uint8Array(rtuFrame));
      const rtuResponse = await rtuPromise;
      expect(rtuResponse.data).toEqual([0x1234]);

      // Test ASCII delegation
      client.protocol = "ascii";
      const asciiPromise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      });

      // ASCII frame
      const messageBytes = [0x01, 0x03, 0x02, 0x12, 0x34];
      const lrc = calculateLRC(messageBytes);
      const hexString =
        messageBytes
          .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
          .join("") + lrc.toString(16).padStart(2, "0").toUpperCase();
      const asciiFrame = `:${hexString}\r\n`;

      client.handleResponse(
        new Uint8Array(Array.from(asciiFrame).map((c) => c.charCodeAt(0))),
      );
      const asciiResponse = await asciiPromise;
      expect(asciiResponse.data).toEqual([0x1234]);
    });
  });
});
