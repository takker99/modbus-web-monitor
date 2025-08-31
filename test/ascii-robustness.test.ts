// Additional ASCII robustness tests
import { describe, expect, it } from "vitest";
import { ModbusClient } from "../src/modbus.ts";

describe("ASCII Frame Robustness", () => {
  it("handles frame start without ending after timeout", async () => {
    const client = new ModbusClient();
    client.setProtocol("ascii");

    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    });

    // Send only frame start, never complete it
    const partialFrame = ":010302";
    client.handleResponse(
      new Uint8Array(Array.from(partialFrame).map((c) => c.charCodeAt(0))),
    );

    // Should timeout since frame never completes
    await expect(promise).rejects.toThrow(/Request timed out/);
  });

  it("handles ASCII buffer overflow protection", async () => {
    const client = new ModbusClient();
    client.setProtocol("ascii");

    // Send large amount of noise without frame start/end
    const largeNoise = "A".repeat(10000);
    client.handleResponse(
      new Uint8Array(Array.from(largeNoise).map((c) => c.charCodeAt(0))),
    );

    // Then send valid frame
    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    });

    const responseFrame = ":010302000AF0\r\n";
    client.handleResponse(
      new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0))),
    );

    const response = await promise;
    expect(response.data).toEqual([10]);
  });

  it("handles corrupted frame followed by valid frame", async () => {
    const client = new ModbusClient();
    client.setProtocol("ascii");

    const promise1 = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    });

    // Send corrupted frame with invalid hex - should fail
    const corruptedFrame = ":01G302000AF0\r\n"; // 'G' is invalid hex
    client.handleResponse(
      new Uint8Array(Array.from(corruptedFrame).map((c) => c.charCodeAt(0))),
    );

    // First request should fail
    await expect(promise1).rejects.toThrow(/Invalid hex pair/);

    // Now send a valid frame for a new request
    const promise2 = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    });

    const validFrame = ":010302000AF0\r\n";
    client.handleResponse(
      new Uint8Array(Array.from(validFrame).map((c) => c.charCodeAt(0))),
    );

    const response = await promise2;
    expect(response.data).toEqual([10]);
  });

  it("handles invalid frame format without colon", async () => {
    const client = new ModbusClient();
    client.setProtocol("ascii");

    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    });

    // Frame without colon start
    const responseFrame = "010302000AF0\r\n";
    client.handleResponse(
      new Uint8Array(Array.from(responseFrame).map((c) => c.charCodeAt(0))),
    );

    // Should timeout since no valid frame start
    await expect(promise).rejects.toThrow(/Request timed out/);
  });

  it("handles binary data in ASCII mode", async () => {
    const client = new ModbusClient();
    client.setProtocol("ascii");

    const promise = client.read({
      functionCode: 3,
      quantity: 1,
      slaveId: 1,
      startAddress: 0,
    });

    // Send some binary data followed by valid ASCII frame
    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0x80]);
    const asciiFrame = ":010302000AF0\r\n";
    const combined = new Uint8Array([
      ...binaryData,
      ...Array.from(asciiFrame).map((c) => c.charCodeAt(0)),
    ]);

    client.handleResponse(combined);

    const response = await promise;
    expect(response.data).toEqual([10]);
  });
});
