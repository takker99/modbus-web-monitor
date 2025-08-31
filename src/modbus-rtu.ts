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

export class ModbusRTUClient extends ModbusClientBase {
  #buffer: number[] = [];

  get protocol(): ModbusProtocol {
    return "rtu";
  }

  handleResponse(data: Uint8Array) {
    // Append data to buffer
    this.#buffer.push(...Array.from(data));
    this.#handleRTUResponse();
  }

  protected buildReadRequest(config: ModbusReadConfig): Uint8Array {
    return buildRTUReadRequest(config, "rtu");
  }

  protected buildWriteRequest(config: ModbusWriteConfig): Uint8Array {
    return buildRTUWriteRequest(config, "rtu");
  }

  protected processBufferedData(): void {
    if (this.#buffer.length > 0) {
      this.#handleRTUResponse();
    }
  }

  #handleRTUResponse() {
    while (this.#buffer.length >= 5) {
      const slaveId = this.#buffer[0];
      const functionCode = this.#buffer[1];

      // Check if this frame matches our pending request
      const isMatchingFrame = this.isPendingRequestMatching(slaveId, functionCode);

      if (!isMatchingFrame) {
        // If we have a pending request but frame doesn't match, try to advance buffer
        if (this.pendingRequest) {
          const resyncPosition = findFrameResyncPosition(this.#buffer);
          if (resyncPosition !== -1) {
            this.#buffer = this.#buffer.slice(resyncPosition);
            continue; // Try again with advanced buffer
          } else {
            // No valid frame found, just advance by 1 byte and try again
            this.#buffer = this.#buffer.slice(1);
            continue;
          }
        }
        return;
      }

      // Error response check (exception frame length = 5 bytes: slave + fc + ex + CRC2)
      if (functionCode & 0x80) {
        if (this.#buffer.length < 5) return;
        if (!checkFrameCRC(this.#buffer, 5)) {
          this.#handleError(new Error("CRC error"));
          return;
        }
        const errorCode = this.#buffer[2];
        this.#handleError(errorCode);
        // 例外フレーム消費
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
        // Read function
        const dataLength = this.#buffer[2];
        responseLength = 3 + dataLength + 2; // slaveID + function + byte count + data + CRC
      } else {
        // Write function
        responseLength = 8; // fixed length
      }

      if (this.#buffer.length < responseLength) return;

      // CRC check
      if (!checkFrameCRC(this.#buffer, responseLength)) {
        this.#handleError(new Error("CRC error"));
        return;
      }

      // Process response
      this.#processValidResponse(responseLength);
      return;
    }
  }

  #processValidResponse(responseLength: number) {
    if (!this.pendingRequest) return;

    const response = this.#buffer.slice(0, responseLength);
    const slaveId = response[0];
    const functionCode = response[1];

    let data: number[] = [];
    if (functionCode === 3 || functionCode === 4) {
      // Register read response (FC03/FC04)
      const dataLength = response[2];
      data = parseRegisterResponse(response, dataLength);
    } else if (functionCode === 1 || functionCode === 2) {
      // Coil/input status read response (FC01/FC02)
      const dataLength = response[2];
      data = parseBitResponse(response, dataLength);
    }

    const modbusResponse = this.createResponse(slaveId, functionCode, data);
    this.completePendingRequest(modbusResponse);

    // Trim processed bytes from buffer
    this.#buffer = this.#buffer.slice(responseLength);
  }

  #handleError(error: number | Error, attemptResync = true) {
    if (!this.pendingRequest) return;

    if (typeof error === "number") {
      // Use the new ModbusExceptionError for consistency
      this.rejectPendingRequest(new ModbusExceptionError(error));
    } else {
      this.rejectPendingRequest(error);
    }

    // Attempt buffer resynchronization for RTU protocol
    if (attemptResync && this.#buffer.length > 0) {
      const resyncPosition = findFrameResyncPosition(this.#buffer);
      if (resyncPosition !== -1) {
        // Found a potential frame start, advance buffer to that position
        this.#buffer = this.#buffer.slice(resyncPosition);
      } else {
        // No candidate found, clear buffer completely
        this.#buffer = [];
      }
    } else {
      // Clear buffer completely
      this.#buffer = [];
    }
  }
}