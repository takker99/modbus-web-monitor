import { ModbusExceptionError } from "./errors.ts";
import {
  buildReadRequest as buildASCIIReadRequest,
  buildWriteRequest as buildASCIIWriteRequest,
  type ModbusProtocol,
} from "./frameBuilder.ts";
import { parseBitResponse, parseRegisterResponse } from "./frameParser.ts";
import { calculateLRC } from "./lrc.ts";
import {
  ModbusClientBase,
  type ModbusReadConfig,
  type ModbusWriteConfig,
} from "./modbus-base.ts";

/**
 * Modbus ASCII client implementation.
 *
 * Parses incoming ASCII frames (colon-started, CRLF-terminated), validates
 * LRC and matches responses against the pending request. Uses the same
 * single-pending-request policy as the RTU client.
 */
export class ModbusASCIIClient extends ModbusClientBase {
  /** Raw byte buffer used when data arrives as Uint8Array. */
  #buffer: number[] = [];
  /** Accumulated ASCII characters used to assemble a frame string. */
  #asciiBuffer: string = "";
  /** Whether a frame start ':' has been detected and not yet closed. */
  #asciiFrameStarted = false;

  get protocol(): ModbusProtocol {
    return "ascii";
  }

  /** Append received bytes to internal buffer and attempt parsing. */
  handleResponse(data: Uint8Array) {
    this.#buffer.push(...Array.from(data));
    this.#handleASCIIResponse();
  }

  protected buildReadRequest(config: ModbusReadConfig): Uint8Array {
    return buildASCIIReadRequest(config, "ascii");
  }

  protected buildWriteRequest(config: ModbusWriteConfig): Uint8Array {
    return buildASCIIWriteRequest(config, "ascii");
  }

  /** Trigger parsing when buffer or ascii accumulation contains data. */
  protected processBufferedData(): void {
    if (this.#buffer.length > 0 || this.#asciiBuffer.length > 0) {
      this.#handleASCIIResponse();
    }
  }

  /**
   * Internal handler that assembles ASCII frame strings and parses a single
   * complete frame per invocation.
   *
   * @private
   */
  #handleASCIIResponse() {
    // Convert buffer to string to look for ASCII frame markers
    const newData = String.fromCharCode(...this.#buffer);
    this.#asciiBuffer += newData;
    this.#buffer = [];

    // Only process one complete frame at a time.
    if (!this.#asciiFrameStarted) {
      const startIndex = this.#asciiBuffer.indexOf(":");
      if (startIndex === -1) {
        return;
      }
      this.#asciiBuffer = this.#asciiBuffer.substring(startIndex);
      this.#asciiFrameStarted = true;
    }

    const endIndex = this.#asciiBuffer.indexOf("\r\n");
    if (endIndex === -1) {
      return;
    }

    const frameString = this.#asciiBuffer.substring(0, endIndex);
    this.#asciiBuffer = this.#asciiBuffer.substring(endIndex + 2);
    this.#asciiFrameStarted = false;

    this.#parseASCIIFrame(frameString);
  }

  /**
   * Parse a complete ASCII frame string (starting with ':' and excluding CRLF).
   * Validates format, hex content, and LRC before delegating to response
   * handling logic.
   *
   * @private
   */
  #parseASCIIFrame(frameString: string) {
    if (frameString.length < 3 || frameString[0] !== ":") {
      this.#handleError(new Error("Invalid ASCII frame format"));
      return;
    }

    const hexString = frameString.substring(1);
    if (hexString.length % 2 !== 0) {
      this.#handleError(
        new Error("ASCII frame contains odd number of hex characters"),
      );
      return;
    }

    const frameBytes: number[] = [];
    for (let i = 0; i < hexString.length; i += 2) {
      const hexPair = hexString.substring(i, i + 2);
      if (!/^[0-9A-Fa-f]{2}$/.test(hexPair)) {
        this.#handleError(
          new Error(`Invalid hex pair in ASCII frame: ${hexPair}`),
        );
        return;
      }
      const byte = parseInt(hexPair, 16);
      frameBytes.push(byte);
    }

    if (frameBytes.length < 3) {
      this.#handleError(new Error("ASCII frame too short"));
      return;
    }

    const receivedLRC = frameBytes[frameBytes.length - 1];
    const messageBytes = frameBytes.slice(0, -1);
    const calculatedLRC = calculateLRC(messageBytes);

    if (receivedLRC !== calculatedLRC) {
      this.#handleError(new Error("LRC error"));
      return;
    }

    if (!this.pendingRequest) {
      return;
    }

    const slaveId = messageBytes[0];
    const functionCode = messageBytes[1];

    if (!this.isPendingRequestMatching(slaveId, functionCode)) {
      return;
    }

    if (functionCode & 0x80) {
      if (messageBytes.length < 3) {
        this.#handleError(new Error("Invalid exception frame length"));
        return;
      }
      const errorCode = messageBytes[2];
      this.#handleError(errorCode);
      return;
    }

    this.#processValidASCIIResponse(messageBytes);
  }

  /**
   * Handle a validated ASCII response message bytes and complete the pending
   * request with a decoded ModbusResponse.
   *
   * @private
   */
  #processValidASCIIResponse(messageBytes: number[]) {
    if (!this.pendingRequest) return;

    const slaveId = messageBytes[0];
    const functionCode = messageBytes[1];

    let data: number[] = [];
    if (functionCode === 3 || functionCode === 4) {
      const dataLength = messageBytes[2];
      data = parseRegisterResponse(messageBytes, dataLength);
    } else if (functionCode === 1 || functionCode === 2) {
      const dataLength = messageBytes[2];
      data = parseBitResponse(messageBytes, dataLength);
    }

    const modbusResponse = this.createResponse(slaveId, functionCode, data);
    this.completePendingRequest(modbusResponse);
  }

  /**
   * Handle an error (numeric Modbus exception code or Error) for the
   * currently pending request. Clears ASCII buffers on error.
   *
   * @private
   */
  #handleError(error: number | Error) {
    if (!this.pendingRequest) return;

    if (typeof error === "number") {
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
