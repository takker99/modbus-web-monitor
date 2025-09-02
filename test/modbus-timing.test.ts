import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateCRC16 } from "../src/crc.ts";
import { FUNCTION_CODE_LABELS } from "../src/functionCodes.ts";
import { ModbusClient } from "../src/modbus.ts";

describe("Timing Edge Case Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Abort Handling (replaces legacy internal timeout)", () => {
    it("rejects request when aborted", async () => {
      const client = new ModbusClient();
      const controller = new AbortController();
      const promise = client.read(
        {
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 0,
        },
        { signal: controller.signal },
      );
      controller.abort(new Error("Aborted"));
      await expect(promise).rejects.toThrow(/aborted/i);
    });

    it("ignores late frame after abort", async () => {
      const client = new ModbusClient();
      const controller = new AbortController();
      const promise = client.read(
        {
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 0,
        },
        { signal: controller.signal },
      );
      controller.abort();
      await expect(promise).rejects.toThrow(/aborted/i);
      const frame = [1, 3, 2, 0x12, 0x34];
      const crc = calculateCRC16(frame);
      frame.push(crc & 0xff, (crc >> 8) & 0xff);
      const responseSpy = vi.fn();
      client.on("response", responseSpy);
      expect(() => client.handleResponse(new Uint8Array(frame))).not.toThrow();
      expect(responseSpy).not.toHaveBeenCalled();
    });

    it("handles multiple abort scenarios in sequence", async () => {
      const client = new ModbusClient();
      const c1 = new AbortController();
      const p1 = client.read(
        { functionCode: 3, quantity: 1, slaveId: 1, startAddress: 0 },
        { signal: c1.signal },
      );
      c1.abort();
      await expect(p1).rejects.toThrow(/aborted/i);
      const c2 = new AbortController();
      const p2 = client.read(
        { functionCode: 3, quantity: 1, slaveId: 1, startAddress: 10 },
        { signal: c2.signal },
      );
      c2.abort(new Error("User abort"));
      await expect(p2).rejects.toThrow(/User abort/);
      const p3 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 20,
      });
      const frame = [1, 3, 2, 0x99, 0xaa];
      const crc = calculateCRC16(frame);
      frame.push(crc & 0xff, (crc >> 8) & 0xff);
      client.handleResponse(new Uint8Array(frame));
      const response = await p3;
      expect(response.data).toEqual([0x99aa]);
    });
  });

  describe("Overlapping Request Prevention", () => {
    it("rejects second request while first is pending", async () => {
      const client = new ModbusClient();

      // Start first request
      const promise1 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      });

      // Try to start second request immediately - should be rejected
      await expect(
        client.read({
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 10,
        }),
      ).rejects.toThrow("Another request is in progress");

      // First request should still be pending and can be resolved
      const frame = [1, 3, 2, 0x12, 0x34];
      const crc = calculateCRC16(frame);
      frame.push(crc & 0xff, (crc >> 8) & 0xff);

      client.handleResponse(new Uint8Array(frame));

      const response = await promise1;
      expect(response.data).toEqual([0x1234]);
    });

    it("allows new request after first completes", async () => {
      const client = new ModbusClient();

      // First request
      const promise1 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      });

      // Complete first request
      const frame1 = [1, 3, 2, 0x12, 0x34];
      const crc1 = calculateCRC16(frame1);
      frame1.push(crc1 & 0xff, (crc1 >> 8) & 0xff);

      client.handleResponse(new Uint8Array(frame1));
      const response1 = await promise1;
      expect(response1.data).toEqual([0x1234]);

      // Now second request should be allowed
      const promise2 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 10,
      });

      // Complete second request
      const frame2 = [1, 3, 2, 0x56, 0x78];
      const crc2 = calculateCRC16(frame2);
      frame2.push(crc2 & 0xff, (crc2 >> 8) & 0xff);

      client.handleResponse(new Uint8Array(frame2));
      const response2 = await promise2;
      expect(response2.data).toEqual([0x5678]);
    });

    it("allows new request after first aborted", async () => {
      const client = new ModbusClient();
      const controller = new AbortController();
      const promise1 = client.read(
        { functionCode: 3, quantity: 1, slaveId: 1, startAddress: 0 },
        { signal: controller.signal },
      );
      controller.abort();
      await expect(promise1).rejects.toThrow(/aborted/i);

      // Second request should now be allowed
      const promise2 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 10,
      });

      // Complete second request
      const frame2 = [1, 3, 2, 0x56, 0x78];
      const crc2 = calculateCRC16(frame2);
      frame2.push(crc2 & 0xff, (crc2 >> 8) & 0xff);

      client.handleResponse(new Uint8Array(frame2));
      const response2 = await promise2;
      expect(response2.data).toEqual([0x5678]);
    });

    it("rejects overlapping write requests", async () => {
      const client = new ModbusClient();

      // Start write request
      const promise1 = client.write({
        address: 0,
        functionCode: 6,
        slaveId: 1,
        value: 0x1234,
      });

      // Try overlapping write - should be rejected
      await expect(
        client.write({
          address: 10,
          functionCode: 6,
          slaveId: 1,
          value: 0x5678,
        }),
      ).rejects.toThrow("Another request is in progress");

      // Complete first write
      const frame = [1, 6, 0, 0, 0x12, 0x34];
      const crc = calculateCRC16(frame);
      frame.push(crc & 0xff, (crc >> 8) & 0xff);

      client.handleResponse(new Uint8Array(frame));
      await promise1; // Should complete without error
    });
  });

  describe("Race Condition Prevention", () => {
    it("handles rapid request-response cycles without state corruption", async () => {
      const client = new ModbusClient();

      for (let i = 0; i < 10; i++) {
        const promise = client.read({
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: i,
        });

        // Immediately send response
        const frame = [1, 3, 2, i & 0xff, (i + 1) & 0xff];
        const crc = calculateCRC16(frame);
        frame.push(crc & 0xff, (crc >> 8) & 0xff);

        client.handleResponse(new Uint8Array(frame));

        const response = await promise;
        expect(response.data.length).toBe(1);
        expect(response.data[0]).toBe(((i & 0xff) << 8) | ((i + 1) & 0xff));
      }
    });

    it("properly cleans up after exceptions in processing", async () => {
      const client = new ModbusClient();

      // Start request
      const promise = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 0,
      });

      // Send exception response
      const frame = [1, 0x83, 0x02]; // Exception: Illegal data address
      const crc = calculateCRC16(frame);
      frame.push(crc & 0xff, (crc >> 8) & 0xff);

      client.handleResponse(new Uint8Array(frame));

      await expect(promise).rejects.toThrow("Illegal data address");

      // Should be able to start new request after exception
      const promise2 = client.read({
        functionCode: 3,
        quantity: 1,
        slaveId: 1,
        startAddress: 10,
      });

      const frame2 = [1, 3, 2, 0x99, 0xaa];
      const crc2 = calculateCRC16(frame2);
      frame2.push(crc2 & 0xff, (crc2 >> 8) & 0xff);

      client.handleResponse(new Uint8Array(frame2));

      const response2 = await promise2;
      expect(response2.data).toEqual([0x99aa]);
    });

    it("handles abort occurring during response processing", async () => {
      const client = new ModbusClient();
      const controller = new AbortController();
      const promise = client.read(
        { functionCode: 3, quantity: 1, slaveId: 1, startAddress: 0 },
        { signal: controller.signal },
      );
      client.handleResponse(new Uint8Array([1, 3, 2, 0x12])); // partial
      controller.abort();
      client.handleResponse(new Uint8Array([0x34, 0, 0])); // late / invalid remainder
      await expect(promise).rejects.toThrow(/aborted/i);
    });
  });

  describe("Monitoring Integration with Timing", () => {
    it("handles monitoring interval timing", () => {
      const client = new ModbusClient();

      const mockRead = vi.spyOn(client, "read").mockResolvedValue({
        data: [0x1234],
        functionCode: 3,
        functionCodeLabel: FUNCTION_CODE_LABELS[3],
        slaveId: 1,
        timestamp: new Date(),
      });

      // Start monitoring with 1 second interval
      client.startMonitoring(
        {
          functionCode: 3,
          quantity: 1,
          slaveId: 1,
          startAddress: 0,
        },
        1000,
      );

      // Should not have called read yet
      expect(mockRead).not.toHaveBeenCalled();

      // Advance time to trigger first call
      vi.advanceTimersByTime(1000);
      expect(mockRead).toHaveBeenCalledTimes(1);

      // Advance time to trigger second call
      vi.advanceTimersByTime(1000);
      expect(mockRead).toHaveBeenCalledTimes(2);

      client.stopMonitoring();
      mockRead.mockRestore();
    });
  });
});
