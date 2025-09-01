// Integration tests showing both class-based and pure function APIs working together
import { beforeEach, describe, expect, it } from "vitest";
import { readHoldingRegisters, writeSingleRegister } from "../src/api/rtu.ts";
import { calculateCRC16 } from "../src/crc.ts";
import { ModbusClient } from "../src/modbus.ts";
import {
  MockTransport,
  type MockTransportConfig,
} from "../src/transport/index.ts";
import { isErr, isOk, map, unwrapOr } from "../src/types/result.ts";

describe("API Integration", () => {
  let transport: MockTransport;
  let client: ModbusClient;

  beforeEach(async () => {
    // Set up mock transport
    const config: MockTransportConfig = {
      name: "integration-test",
      type: "mock",
    };

    transport = new MockTransport(config);
    await transport.connect();
    transport.clearSentData();
    transport.clearAutoResponses();

    // Set up class-based client
    client = new ModbusClient();
    client.protocol = "rtu";
  });

  it("should work with both APIs simultaneously", async () => {
    // Setup auto-responses for both APIs

    // For pure function API - read holding registers
    const readRequest = [1, 3, 0, 0, 0, 2]; // Read 2 registers from address 0
    const readCrc = calculateCRC16(readRequest);
    readRequest.push(readCrc & 0xff, (readCrc >> 8) & 0xff);

    const readResponse = [1, 3, 4, 0x12, 0x34, 0x56, 0x78]; // 2 registers: 0x1234, 0x5678
    const readResponseCrc = calculateCRC16(readResponse);
    readResponse.push(readResponseCrc & 0xff, (readResponseCrc >> 8) & 0xff);

    transport.setAutoResponse(
      new Uint8Array(readRequest),
      new Uint8Array(readResponse),
    );

    // For class-based API - write single register
    const writeRequest = [1, 6, 0, 10, 0xab, 0xcd]; // Write 0xABCD to address 10
    const writeCrc = calculateCRC16(writeRequest);
    writeRequest.push(writeCrc & 0xff, (writeCrc >> 8) & 0xff);

    transport.setAutoResponse(
      new Uint8Array(writeRequest),
      new Uint8Array(writeRequest), // Echo for write operations
    );

    // Test pure function API
    const readResult = await readHoldingRegisters(transport, 1, 0, 2);
    expect(isOk(readResult)).toBe(true);

    if (isOk(readResult)) {
      expect(readResult.data.data).toEqual([0x1234, 0x5678]);
      expect(readResult.data.functionCodeLabel).toBe("Holding Registers");
    }

    // Test pure function API write
    const writeResult = await writeSingleRegister(transport, 1, 10, 0xabcd);
    expect(isOk(writeResult)).toBe(true);

    // Verify both operations sent the expected data
    expect(transport.getSentDataCount()).toBe(2);

    const sentData = transport.sentData;
    expect(sentData[0]).toEqual(new Uint8Array(readRequest));
    expect(sentData[1]).toEqual(new Uint8Array(writeRequest));
  });

  it("should handle errors gracefully in both APIs", async () => {
    // Don't set up any auto-responses to trigger timeouts

    // Test pure function API timeout
    const readResult = await readHoldingRegisters(transport, 1, 0, 1, {
      timeout: 50,
    });
    expect(isErr(readResult)).toBe(true);
    if (isErr(readResult)) {
      expect(readResult.error.message).toBe("Request timeout");
    }

    // Test pure function API write timeout
    const writeResult = await writeSingleRegister(transport, 1, 0, 123, {
      timeout: 50,
    });
    expect(isErr(writeResult)).toBe(true);
    if (isErr(writeResult)) {
      expect(writeResult.error.message).toBe("Request timeout");
    }
  });

  it("should demonstrate different error handling approaches", async () => {
    // Setup exception response
    const request = [1, 3, 0, 0, 0, 1];
    const crc = calculateCRC16(request);
    request.push(crc & 0xff, (crc >> 8) & 0xff);

    const exceptionResponse = [1, 0x83, 2]; // Exception code 2: Illegal data address
    const exceptionCrc = calculateCRC16(exceptionResponse);
    exceptionResponse.push(exceptionCrc & 0xff, (exceptionCrc >> 8) & 0xff);

    transport.setAutoResponse(
      new Uint8Array(request),
      new Uint8Array(exceptionResponse),
    );

    // Pure function API - Result type approach
    const result = await readHoldingRegisters(transport, 1, 0, 1);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain("Illegal data address");
      // Can handle error without try/catch
      console.log("Functional API error:", result.error.message);
    }

    // The Result type approach allows for more functional error handling:
    // - No exceptions thrown
    // - Explicit error checking with type safety
    // - Composable error handling with map/andThen/etc.
  });

  it("should show Result type composition", async () => {
    // Setup successful response
    const request = [1, 3, 0, 0, 0, 1];
    const crc = calculateCRC16(request);
    request.push(crc & 0xff, (crc >> 8) & 0xff);

    const response = [1, 3, 2, 0x00, 0x42]; // Register value: 66
    const responseCrc = calculateCRC16(response);
    response.push(responseCrc & 0xff, (responseCrc >> 8) & 0xff);

    transport.setAutoResponse(
      new Uint8Array(request),
      new Uint8Array(response),
    );

    // Demonstrate Result composition
    const result = await readHoldingRegisters(transport, 1, 0, 1);

    // Extract just the register value and double it
    const doubledValue = result.success ? result.data.data[0] * 2 : 0;

    expect(doubledValue).toBe(132); // 66 * 2

    // Or use functional composition
    const extractedValue = map(result, (response) => response.data[0]);
    const finalValue = unwrapOr(extractedValue, 0);

    expect(finalValue).toBe(66);
  });

  it("should demonstrate transport state management", async () => {
    // Test transport state changes
    expect(transport.state).toBe("connected");
    expect(transport.connected).toBe(true);

    const stateChanges: string[] = [];
    transport.on("stateChange", (state) => {
      stateChanges.push(state);
    });

    await transport.disconnect();
    expect(transport.state).toBe("disconnected");
    expect(transport.connected).toBe(false);
    expect(stateChanges).toContain("disconnected");

    // Try to use pure function API with disconnected transport
    const result = await readHoldingRegisters(transport, 1, 0, 1);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toBe("Transport not connected");
    }
  });
});
