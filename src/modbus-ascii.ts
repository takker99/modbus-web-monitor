import { ModbusExceptionError } from "./errors.ts";
import {
  buildReadRequest as buildASCIIReadRequest,
  buildWriteRequest as buildASCIIWriteRequest,
  type ModbusProtocol,
} from "./frameBuilder.ts";
import {
  parseBitResponse,
  parseRegisterResponse,
} from "./frameParser.ts";
import { calculateLRC } from "./lrc.ts";
import {
  ModbusClientBase,
  type ModbusReadConfig,
  type ModbusWriteConfig,
} from "./modbus-base.ts";

export class ModbusASCIIClient extends ModbusClientBase {
  #buffer: number[] = [];
  #asciiBuffer: string = "";
  #asciiFrameStarted = false;

  get protocol(): ModbusProtocol {
    return "ascii";
  }

  handleResponse(data: Uint8Array) {
    // Append data to buffer
    this.#buffer.push(...Array.from(data));
    this.#handleASCIIResponse();
  }

  protected buildReadRequest(config: ModbusReadConfig): Uint8Array {
    return buildASCIIReadRequest(config, "ascii");
  }

  protected buildWriteRequest(config: ModbusWriteConfig): Uint8Array {
    return buildASCIIWriteRequest(config, "ascii");
  }

  protected processBufferedData(): void {
    if (this.#buffer.length > 0 || this.#asciiBuffer.length > 0) {
      this.#handleASCIIResponse();
    }
  }

  #handleASCIIResponse() {
    // Convert buffer to string to look for ASCII frame markers
    const newData = String.fromCharCode(...this.#buffer);
    this.#asciiBuffer += newData;
    this.#buffer = []; // Clear the buffer as we've moved data to asciiBuffer

    // Process only one complete frame at a time (like RTU mode)
    // Look for start of frame ':'
    if (!this.#asciiFrameStarted) {
      const startIndex = this.#asciiBuffer.indexOf(":");
      if (startIndex === -1) {
        // No start found, keep waiting
        return;
      }
      // Remove everything before ':'
      this.#asciiBuffer = this.#asciiBuffer.substring(startIndex);
      this.#asciiFrameStarted = true;
    }

    // Look for end of frame \r\n
    const endIndex = this.#asciiBuffer.indexOf("\r\n");
    if (endIndex === -1) {
      // Frame not complete yet
      return;
    }

    // Extract complete frame (including : but excluding \r\n)
    const frameString = this.#asciiBuffer.substring(0, endIndex);
    this.#asciiBuffer = this.#asciiBuffer.substring(endIndex + 2);
    this.#asciiFrameStarted = false;

    // Parse the frame
    this.#parseASCIIFrame(frameString);
  }

  #parseASCIIFrame(frameString: string) {
    // Frame should start with ':' and contain hex pairs
    if (frameString.length < 3 || frameString[0] !== ":") {
      this.#handleError(new Error("Invalid ASCII frame format"));
      return;
    }

    // Remove the ':' and parse hex pairs
    const hexString = frameString.substring(1);
    if (hexString.length % 2 !== 0) {
      this.#handleError(
        new Error("ASCII frame contains odd number of hex characters"),
      );
      return;
    }

    // Convert hex pairs to bytes
    const frameBytes: number[] = [];
    for (let i = 0; i < hexString.length; i += 2) {
      const hexPair = hexString.substring(i, i + 2);

      // Validate that both characters are valid hex digits
      if (!/^[0-9A-Fa-f]{2}$/.test(hexPair)) {
        this.#handleError(
          new Error(`Invalid hex pair in ASCII frame: ${hexPair}`),
        );
        return;
      }

      const byte = parseInt(hexPair, 16);
      frameBytes.push(byte);
    }

    // Need at least slave + function + LRC = 3 bytes
    if (frameBytes.length < 3) {
      this.#handleError(new Error("ASCII frame too short"));
      return;
    }

    // Extract LRC (last byte) and message (all but last byte)
    const receivedLRC = frameBytes[frameBytes.length - 1];
    const messageBytes = frameBytes.slice(0, -1);
    const calculatedLRC = calculateLRC(messageBytes);

    if (receivedLRC !== calculatedLRC) {
      this.#handleError(new Error("LRC error"));
      return;
    }

    // Validate against pending request
    if (!this.pendingRequest) {
      return;
    }

    const slaveId = messageBytes[0];
    const functionCode = messageBytes[1];

    if (!this.isPendingRequestMatching(slaveId, functionCode)) {
      return;
    }

    // Handle exception frame (function | 0x80)
    if (functionCode & 0x80) {
      if (messageBytes.length < 3) {
        this.#handleError(new Error("Invalid exception frame length"));
        return;
      }
      const errorCode = messageBytes[2];
      this.#handleError(errorCode);
      return;
    }

    // Process valid response
    this.#processValidASCIIResponse(messageBytes);
  }

  #processValidASCIIResponse(messageBytes: number[]) {
    if (!this.pendingRequest) return;

    const slaveId = messageBytes[0];
    const functionCode = messageBytes[1];

    let data: number[] = [];
    if (functionCode === 3 || functionCode === 4) {
      // Register read response (FC03/FC04)
      const dataLength = messageBytes[2];
      data = parseRegisterResponse(messageBytes, dataLength);
    } else if (functionCode === 1 || functionCode === 2) {
      // Coil/input status read response (FC01/FC02)
      const dataLength = messageBytes[2];
      data = parseBitResponse(messageBytes, dataLength);
    }

    const modbusResponse = this.createResponse(slaveId, functionCode, data);
    this.completePendingRequest(modbusResponse);
  }

  #handleError(error: number | Error) {
    if (!this.pendingRequest) return;

    if (typeof error === "number") {
      // Use the new ModbusExceptionError for consistency
      this.rejectPendingRequest(new ModbusExceptionError(error));
    } else {
      this.rejectPendingRequest(error);
    }

    // For ASCII, clear buffer completely
    this.#buffer = [];
    this.#asciiBuffer = "";
    this.#asciiFrameStarted = false;
  }
}