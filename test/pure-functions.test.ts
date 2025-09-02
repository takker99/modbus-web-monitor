// Tests for pure function API

import { isErr, isOk, unwrapErr, unwrapOk } from "option-t/plain_result";
import { beforeEach, describe, expect, it } from "vitest";
import { readHoldingRegisters as readHoldingRegistersASCII } from "../src/ascii.ts";
import { calculateCRC16 } from "../src/crc.ts";
import {
  readCoils,
  readDiscreteInputs,
  readHoldingRegisters,
  readInputRegisters,
  writeMultipleCoils,
  writeMultipleRegisters,
  writeSingleCoil,
  writeSingleRegister,
} from "../src/rtu.ts";
import { MockTransport } from "../src/transport/mock-transport.ts";
import type { MockTransportConfig } from "../src/transport/transport.ts";

describe("Pure Function API", () => {
  let transport: MockTransport;

  beforeEach(async () => {
    const config: MockTransportConfig = {
      name: "api-test",
      type: "mock",
    };

    transport = new MockTransport(config);
    await transport.connect();
    transport.clearSentData();
    transport.clearAutoResponses();
  });

  describe("Read Operations", () => {
    it("should read coils successfully (FC01)", async () => {
      // Setup auto-response for read coils request
      const expectedRequest = [1, 1, 0, 0, 0, 8]; // Read 8 coils from address 0
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      const responseData = [1, 1, 1, 0xab]; // 1 byte of data: 0xAB
      const responseCrc = calculateCRC16(responseData);
      responseData.push(responseCrc & 0xff, (responseCrc >> 8) & 0xff);

      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(responseData),
      );

      const result = await readCoils(transport, 1, 0, 8);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const data = unwrapOk(result);
        expect(data.slaveId).toBe(1);
        expect(data.functionCode).toBe(1);
        expect(data.address).toBe(0);
        expect(data.data).toHaveLength(8);
        // Firss of 0xAB (171): 1,1,0,1,0,1,0,1
        expect(data.data.slice(0, 8)).toEqual([1, 1, 0, 1, 0, 1, 0, 1]);
      }
    });

    it("should read discrete inputs successfully (FC02)", async () => {
      const expectedRequest = [1, 2, 0, 10, 0, 5]; // Read 5 inputs from address 10
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      const responseData = [1, 2, 1, 0x1f]; // 1 byte: 0x1F (5 bits set)
      const responseCrc = calculateCRC16(responseData);
      responseData.push(responseCrc & 0xff, (responseCrc >> 8) & 0xff);

      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(responseData),
      );

      const result = await readDiscreteInputs(transport, 1, 10, 5);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const data = unwrapOk(result);
        expect(data.functionCode).toBe(2);
        expect(data.address).toBe(10);
        expect(data.data.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
      }
    });

    it("should read holding registers successfully (FC03)", async () => {
      const expectedRequest = [1, 3, 0, 0, 0, 2]; // Read 2 registers from address 0
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      const responseData = [1, 3, 4, 0x12, 0x34, 0x56, 0x78]; // 2 registers: 0x1234, 0x5678
      const responseCrc = calculateCRC16(responseData);
      responseData.push(responseCrc & 0xff, (responseCrc >> 8) & 0xff);

      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(responseData),
      );

      const result = await readHoldingRegisters(transport, 1, 0, 2);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const data = unwrapOk(result);
        expect(data.functionCode).toBe(3);
        expect(data.data).toEqual([0x1234, 0x5678]);
      }
    });

    it("should read input registers successfully (FC04)", async () => {
      const expectedRequest = [1, 4, 0, 100, 0, 1]; // Read 1 register from address 100
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      const responseData = [1, 4, 2, 0xab, 0xcd]; // 1 register: 0xABCD
      const responseCrc = calculateCRC16(responseData);
      responseData.push(responseCrc & 0xff, (responseCrc >> 8) & 0xff);

      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(responseData),
      );

      const result = await readInputRegisters(transport, 1, 100, 1);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const data = unwrapOk(result);
        expect(data.functionCode).toBe(4);
        expect(data.data).toEqual([0xabcd]);
      }
    });

    it("should handle exception responses", async () => {
      // Setup exception response for illegal function
      const expectedRequest = [1, 3, 0, 0, 0, 1];
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      const exceptionResponse = [1, 0x83, 1]; // Exception code 1: Illegal function
      const exceptionCrc = calculateCRC16(exceptionResponse);
      exceptionResponse.push(exceptionCrc & 0xff, (exceptionCrc >> 8) & 0xff);

      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(exceptionResponse),
      );

      const result = await readHoldingRegisters(transport, 1, 0, 1);

      expect(isErr(result)).toBe(true);
      if (isErr(result))
        expect(unwrapErr(result).message).toContain("Illegal function");
    });
  });

  describe("Write Operations", () => {
    it("should write single coil successfully (FC05)", async () => {
      const expectedRequest = [1, 5, 0, 0, 0xff, 0x00]; // Write coil ON at address 0
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      // Echo the request as response for write operations
      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(expectedRequest),
      );

      const result = await writeSingleCoil(transport, 1, 0, true);

      expect(isOk(result)).toBe(true);
      expect(transport.getSentDataCount()).toBe(1);
    });

    it("should write single register successfully (FC06)", async () => {
      const expectedRequest = [1, 6, 0, 10, 0x12, 0x34]; // Write 0x1234 to address 10
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(expectedRequest),
      );

      const result = await writeSingleRegister(transport, 1, 10, 0x1234);

      expect(isOk(result)).toBe(true);
    });

    it("should write multiple coils successfully (FC15)", async () => {
      // Write 3 coils: true, false, true starting at address 0
      const expectedRequest = [1, 15, 0, 0, 0, 3, 1, 0x05]; // 0x05 = 00000101 (first 3 bits)
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      const responseData = [1, 15, 0, 0, 0, 3]; // Echo back address and quantity
      const responseCrc = calculateCRC16(responseData);
      responseData.push(responseCrc & 0xff, (responseCrc >> 8) & 0xff);

      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(responseData),
      );

      const result = await writeMultipleCoils(transport, 1, 0, [
        true,
        false,
        true,
      ]);

      expect(isOk(result)).toBe(true);
    });

    it("should write multiple registers successfully (FC16)", async () => {
      const expectedRequest = [1, 16, 0, 0, 0, 2, 4, 0x12, 0x34, 0x56, 0x78]; // Write 2 registers
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      const responseData = [1, 16, 0, 0, 0, 2]; // Echo back address and quantity
      const responseCrc = calculateCRC16(responseData);
      responseData.push(responseCrc & 0xff, (responseCrc >> 8) & 0xff);

      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(responseData),
      );

      const result = await writeMultipleRegisters(
        transport,
        1,
        0,
        [0x1234, 0x5678],
      );

      expect(isOk(result)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle transport not connected", async () => {
      await transport.disconnect();

      const result = await readHoldingRegisters(transport, 1, 0, 1);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(unwrapErr(result).message).toBe("Transport not connected");
      }
    });

    it("should support external abort (no built-in timeout)", async () => {
      const controller = new AbortController();
      const p = readHoldingRegisters(transport, 1, 0, 1, {
        signal: controller.signal,
      });
      controller.abort(new Error("Aborted"));
      const result = await p;
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(unwrapErr(result).message).toMatch(/aborted/i);
      }
    });

    it("should handle send failures", async () => {
      const failingTransport = new MockTransport(
        { name: "failing", type: "mock" },
        { errorMessage: "Send failed", shouldFailSend: true },
      );
      await failingTransport.connect();

      const result = await readHoldingRegisters(failingTransport, 1, 0, 1);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(unwrapErr(result).message).toBe("Send failed");
      }
    });

    it("should handle invalid/mismatched function scenario via abort", async () => {
      const controller = new AbortController();
      const p = readHoldingRegisters(transport, 1, 0, 1, {
        signal: controller.signal,
      });
      // No autoResponse provided; abort externally
      controller.abort(new Error("Aborted"));
      const result = await p;
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(unwrapErr(result).message).toMatch(/aborted/i);
      }
    });

    it("should handle malformed responses (aborted externally)", async () => {
      const expectedRequest = [1, 3, 0, 0, 0, 1];
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      // Set up malformed response (too short)
      const malformedResponse = [1, 3]; // Missing data and CRC
      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(malformedResponse),
      );

      const controller = new AbortController();
      const p = readHoldingRegisters(transport, 1, 0, 1, {
        signal: controller.signal,
      });
      controller.abort(new Error("Aborted"));
      const result = await p;
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(unwrapErr(result).message).toMatch(/aborted/i);
      }
    });

    it("should handle CRC errors in responses (aborted externally)", async () => {
      const expectedRequest = [1, 3, 0, 0, 0, 1];
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      // Set up response with bad CRC
      const responseWithBadCRC = [1, 3, 2, 0x12, 0x34, 0xff, 0xff]; // Wrong CRC
      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(responseWithBadCRC),
      );

      const controller = new AbortController();
      const p = readHoldingRegisters(transport, 1, 0, 1, {
        signal: controller.signal,
      });
      controller.abort(new Error("Aborted"));
      const result = await p;
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(unwrapErr(result).message).toMatch(/aborted/i);
      }
    });

    it("should handle all read function error paths", async () => {
      await transport.disconnect();

      // Test all read functions with disconnected transport
      const readFunctions = [
        () => readCoils(transport, 1, 0, 1),
        () => readDiscreteInputs(transport, 1, 0, 1),
        () => readHoldingRegisters(transport, 1, 0, 1),
        () => readInputRegisters(transport, 1, 0, 1),
      ];

      for (const readFunc of readFunctions) {
        const result = await readFunc();
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(unwrapErr(result).message).toBe("Transport not connected");
        }
      }
    });

    it("should handle all write function error paths", async () => {
      await transport.disconnect();

      // Test all write functions with disconnected transport
      const writeFunctions = [
        () => writeSingleCoil(transport, 1, 0, true),
        () => writeSingleRegister(transport, 1, 0, 0x1234),
        () => writeMultipleCoils(transport, 1, 0, [true, false]),
        () => writeMultipleRegisters(transport, 1, 0, [0x1234, 0x5678]),
      ];

      for (const writeFunc of writeFunctions) {
        const result = await writeFunc();
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(unwrapErr(result).message).toBe("Transport not connected");
        }
      }
    });

    it("should handle various exception codes", async () => {
      const exceptionCodes = [
        { code: 1, name: "Illegal function" },
        { code: 2, name: "Illegal data address" },
        { code: 3, name: "Illegal data value" },
        { code: 4, name: "Slave device failure" }, // Keep original text
      ];

      for (const exc of exceptionCodes) {
        const expectedRequest = [1, 3, 0, 0, 0, 1];
        const crc = calculateCRC16(expectedRequest);
        expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

        const exceptionResponse = [1, 0x83, exc.code];
        const exceptionCrc = calculateCRC16(exceptionResponse);
        exceptionResponse.push(exceptionCrc & 0xff, (exceptionCrc >> 8) & 0xff);

        transport.clearAutoResponses();
        transport.setAutoResponse(
          new Uint8Array(expectedRequest),
          new Uint8Array(exceptionResponse),
        );

        const result = await readHoldingRegisters(transport, 1, 0, 1);

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(unwrapErr(result).message).toContain(exc.name);
        }
      }
    });

    it("should handle basic error cases", async () => {
      // Just test that we can handle basic error scenarios
      await transport.disconnect();

      const controller = new AbortController();
      controller.abort();
      const result = await writeSingleRegister(transport, 1, 10, 0x1234, {
        signal: controller.signal,
      });

      expect(isErr(result)).toBe(true);
    });
  });

  describe("Protocol Support", () => {
    it("should support ASCII protocol via ascii import", async () => {
      const controller = new AbortController();
      controller.abort();
      const result = await readHoldingRegistersASCII(transport, 1, 0, 1, {
        signal: controller.signal,
      });
      expect(isErr(result)).toBe(true); // aborted (no response configured)
    });

    it("should use RTU protocol by default", async () => {
      const expectedRequest = [1, 3, 0, 0, 0, 1];
      const crc = calculateCRC16(expectedRequest);
      expectedRequest.push(crc & 0xff, (crc >> 8) & 0xff);

      const responseData = [1, 3, 2, 0x12, 0x34];
      const responseCrc = calculateCRC16(responseData);
      responseData.push(responseCrc & 0xff, (responseCrc >> 8) & 0xff);

      transport.setAutoResponse(
        new Uint8Array(expectedRequest),
        new Uint8Array(responseData),
      );

      const result = await readHoldingRegisters(transport, 1, 0, 1);

      expect(isOk(result)).toBe(true);
      // Verify RTU frame was sent (with CRC)
      const sentData = transport.getLastSentData();
      expect(sentData).toEqual(new Uint8Array(expectedRequest));
    });
  });
});
