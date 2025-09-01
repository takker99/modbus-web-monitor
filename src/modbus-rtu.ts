import { ModbusExceptionError } from "./errors.ts";
import {
  buildReadRequest as buildRTUReadRequest,
  buildWriteRequest as buildRTUWriteRequest,
  type ModbusProtocol,
} from "./frameBuilder.ts";
import {
  checkFrameCRC,
  findFrameResyncPosition,
  parseBitResponse,
  parseRegisterResponse,
} from "./frameParser.ts";
import {
  ModbusClientBase,
  type ModbusReadConfig,
  type ModbusWriteConfig,
} from "./modbus-base.ts";

/**
 * Modbus RTU client implementation.
 *
 * Extends the shared Modbus client base with RTU-specific framing and
 * buffering behaviour. The client accumulates incoming bytes from the
 * serial transport and attempts to parse complete RTU frames. Frames are
 * validated with CRC and matched against the currently pending request.
 */
export class ModbusRTUClient extends ModbusClientBase {
  /**
   * Internal receive buffer for RTU bytes.
   * @private
   */
  #buffer: number[] = [];

  /**
   * Transport protocol identifier.
   * @returns The string literal "rtu" identifying the RTU protocol.
   */
  get protocol(): ModbusProtocol {
    return "rtu";
  }

  /**
   * Handle incoming bytes from the serial transport.
   *
   * The provided data is appended to the internal buffer and parsing is
   * attempted. Partial frames are preserved until enough bytes arrive.
   *
   * @param data - Raw bytes received from the serial transport.
   */
  handleResponse(data: Uint8Array) {
    this.#buffer.push(...Array.from(data));
    this.#handleRTUResponse();
  }

  /**
   * Build a Modbus RTU read request frame.
   *
   * Delegates to the shared frame builder but forces RTU framing rules.
   *
   * @param config - Read request configuration.
   * @returns The serialized RTU request as a Uint8Array.
   */
  protected buildReadRequest(config: ModbusReadConfig): Uint8Array {
    return buildRTUReadRequest(config, "rtu");
  }

  /**
   * Build a Modbus RTU write request frame.
   *
   * Delegates to the shared frame builder but forces RTU framing rules.
   *
   * @param config - Write request configuration.
   * @returns The serialized RTU request as a Uint8Array.
   */
  protected buildWriteRequest(config: ModbusWriteConfig): Uint8Array {
    return buildRTUWriteRequest(config, "rtu");
  }

  /**
   * Called when the transport reports there may be buffered data to process.
   *
   * If the internal buffer contains bytes, parsing is attempted. This method
   * is a lightweight trigger for consumers that implement periodic processing
   * (for example, after a timeout or on link activity).
   */
  protected processBufferedData(): void {
    if (this.#buffer.length > 0) {
      this.#handleRTUResponse();
    }
  }

  /**
   * Parse and handle RTU frames from the internal buffer.
   *
   * This private helper scans the buffer for complete frames, validates CRC
   * and ensures the frame matches the currently pending request. On CRC
   * failure the buffer will be advanced using the resynchronization helper.
   *
   * @private
   */
  #handleRTUResponse() {
    while (this.#buffer.length >= 5) {
      const slaveId = this.#buffer[0];
      const functionCode = this.#buffer[1];

      const isMatchingFrame = this.isPendingRequestMatching(
        slaveId,
        functionCode,
      );

      if (!isMatchingFrame) {
        // If a request is pending but the frame doesn't match, attempt to
        // resynchronize the buffer. If no candidate start is found, advance
        // by a single byte to avoid stalling on malformed data.
        if (this.pendingRequest) {
          const resyncPosition = findFrameResyncPosition(this.#buffer);
          if (resyncPosition !== -1) {
            this.#buffer = this.#buffer.slice(resyncPosition);
            continue;
          } else {
            this.#buffer = this.#buffer.slice(1);
            continue;
          }
        }
        return;
      }

      // Exception/ error frame handling (exception frames are 5 bytes long)
      if (functionCode & 0x80) {
        if (this.#buffer.length < 5) return;
        if (!checkFrameCRC(this.#buffer, 5)) {
          this.#handleError(new Error("CRC error"));
          return;
        }
        const errorCode = this.#buffer[2];
        this.#handleError(errorCode);
        this.#buffer = this.#buffer.slice(5);
        return;
      }

      let responseLength: number;
      if (
        functionCode === 1 ||
        functionCode === 2 ||
        functionCode === 3 ||
        functionCode === 4
      ) {
        // Read functions include a byte count followed by variable data.
        const dataLength = this.#buffer[2];
        responseLength = 3 + dataLength + 2; // slave + fc + byteCount + data + CRC
      } else {
        // Write responses are fixed length.
        responseLength = 8;
      }

      if (this.#buffer.length < responseLength) return;

      if (!checkFrameCRC(this.#buffer, responseLength)) {
        this.#handleError(new Error("CRC error"));
        return;
      }

      this.#processValidResponse(responseLength);
      return;
    }
  }

  /**
   * Process a validated RTU response that was sliced from the buffer.
   *
   * Extracts the payload (registers or bits depending on function code),
   * constructs a Modbus response object and completes the pending request.
   *
   * @param responseLength - Number of bytes that make up the complete frame.
   * @private
   */
  #processValidResponse(responseLength: number) {
    if (!this.pendingRequest) return;

    const response = this.#buffer.slice(0, responseLength);
    const slaveId = response[0];
    const functionCode = response[1];

    let data: number[] = [];
    if (functionCode === 3 || functionCode === 4) {
      const dataLength = response[2];
      data = parseRegisterResponse(response, dataLength);
    } else if (functionCode === 1 || functionCode === 2) {
      const dataLength = response[2];
      data = parseBitResponse(response, dataLength);
    }

    const modbusResponse = this.createResponse(slaveId, functionCode, data);
    this.completePendingRequest(modbusResponse);

    this.#buffer = this.#buffer.slice(responseLength);
  }

  /**
   * Handle errors and exception codes for the current pending request.
   *
   * Numeric errors are treated as Modbus exception codes and wrapped in the
   * ModbusExceptionError type. On error the pending request is rejected and
   * the internal buffer is optionally resynchronized.
   *
   * @param error - Either a numeric Modbus exception code or an Error.
   * @param attemptResync - When true will attempt to locate the next frame
   *                        start in the buffer; otherwise the buffer is
   *                        cleared.
   * @private
   */
  #handleError(error: number | Error, attemptResync = true) {
    if (!this.pendingRequest) return;

    if (typeof error === "number") {
      this.rejectPendingRequest(new ModbusExceptionError(error));
    } else {
      this.rejectPendingRequest(error);
    }

    if (attemptResync && this.#buffer.length > 0) {
      const resyncPosition = findFrameResyncPosition(this.#buffer);
      if (resyncPosition !== -1) {
        this.#buffer = this.#buffer.slice(resyncPosition);
      } else {
        this.#buffer = [];
      }
    } else {
      this.#buffer = [];
    }
  }
}
