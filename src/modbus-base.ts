import { ModbusBusyError } from "./errors.ts";
import type { ModbusProtocol } from "./frameBuilder.ts";
import { FUNCTION_CODE_LABELS, isValidFunctionCode } from "./functionCodes.ts";
import { EventEmitter } from "./serial.ts";

/**
 * High-level Modbus response object used by the client API and UI.
 */
export interface ModbusResponse {
  /** Slave device identifier. */
  slaveId: number;
  /** Function code (without exception bit). */
  functionCode: number;
  /** Human-readable label for the function code. */
  functionCodeLabel: string;
  /** Decoded data payload (registers or bits). */
  data: number[];
  /** Optional address associated with the response (if applicable). */
  address?: number;
  /** Timestamp when the response was created. */
  timestamp: Date;
}

/**
 * Configuration for read requests.
 */
export interface ModbusReadConfig {
  slaveId: number;
  functionCode: 1 | 2 | 3 | 4;
  startAddress: number;
  quantity: number;
}

/**
 * Configuration for write requests.
 */
export interface ModbusWriteConfig {
  slaveId: number;
  functionCode: 5 | 6 | 15 | 16;
  address: number;
  value: number | number[];
}

/**
 * Event types emitted by Modbus clients.
 */
type ModbusClientEvents = {
  response: [ModbusResponse];
  error: [Error];
  request: [Uint8Array];
};

/**
 * Base class for Modbus clients with common functionality.
 *
 * Provides request queuing (single pending request), timeouts, monitoring
 * helpers and event emission for request/response lifecycle.
 */
export abstract class ModbusClientBase extends EventEmitter<ModbusClientEvents> {
  /**
   * The currently pending request (single in-flight request policy).
   * Contains resolve/reject handlers and a timeout id.
   */
  protected pendingRequest: {
    slaveId: number;
    functionCode: number;
    resolve: (response: ModbusResponse) => void;
    reject: (error: Error) => void;
    abortController: AbortController;
  } | null = null;

  /** Interval id used by startMonitoring/stopMonitoring. */
  #monitoringInterval: ReturnType<typeof setInterval> | null = null;

  /** Transport protocol identifier implemented by subclasses. */
  abstract get protocol(): ModbusProtocol;

  /**
   * Execute a Modbus read operation. Returns a promise that resolves with
   * a `ModbusResponse` or rejects with an error (busy/timeout/transport).
   */
  async read(
    config: ModbusReadConfig,
    options: { signal?: AbortSignal } = {},
  ): Promise<ModbusResponse> {
    return new Promise((resolve, reject) => {
      if (this.pendingRequest) {
        reject(new ModbusBusyError());
        return;
      }

      const request = this.buildReadRequest(config);
      const controller = new AbortController();
      const outer = options.signal;
      if (outer) {
        if (outer.aborted) {
          reject(
            outer.reason instanceof Error ? outer.reason : new Error("Aborted"),
          );
          return;
        }
        const onAbort = () => {
          if (this.pendingRequest) {
            const err =
              outer.reason instanceof Error
                ? outer.reason
                : new Error("Aborted");
            this.rejectPendingRequest(err);
          }
        };
        outer.addEventListener("abort", onAbort, {
          once: true,
          signal: controller.signal,
        });
      }
      this.pendingRequest = {
        abortController: controller,
        functionCode: config.functionCode,
        reject,
        resolve,
        slaveId: config.slaveId,
      };

      this.emit("request", request);

      // If the transport already has buffered bytes, trigger processing so
      // the response can be handled without waiting for new data.
      this.processBufferedData();
    });
  }

  /**
   * Execute a Modbus write operation. Promise resolves when the write
   * response is received; resolves to void for API consistency.
   */
  async write(
    config: ModbusWriteConfig,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pendingRequest) {
        reject(new ModbusBusyError());
        return;
      }

      const request = this.buildWriteRequest(config);
      const controller = new AbortController();
      const outer = options.signal;
      if (outer) {
        if (outer.aborted) {
          reject(
            outer.reason instanceof Error ? outer.reason : new Error("Aborted"),
          );
          return;
        }
        const onAbort = () => {
          if (this.pendingRequest) {
            const err =
              outer.reason instanceof Error
                ? outer.reason
                : new Error("Aborted");
            this.rejectPendingRequest(err);
          }
        };
        outer.addEventListener("abort", onAbort, {
          once: true,
          signal: controller.signal,
        });
      }
      this.pendingRequest = {
        abortController: controller,
        functionCode: config.functionCode,
        reject,
        resolve: () => resolve(),
        slaveId: config.slaveId,
      };

      this.emit("request", request);
    });
  }

  /**
   * Start periodic polling using `read` with the provided config.
   * Emits `response` for successful reads and `error` for failures.
   *
   * @param config - Read request configuration used for each poll.
   * @param interval - Polling interval in milliseconds (default 1000).
   */
  startMonitoring(config: ModbusReadConfig, interval = 1000) {
    this.stopMonitoring();

    this.#monitoringInterval = setInterval(async () => {
      try {
        const response = await this.read(config);
        this.emit("response", response);
      } catch (error) {
        this.emit("error", error as Error);
      }
    }, interval);
  }

  /** Stop the polling started by `startMonitoring`. */
  stopMonitoring() {
    if (this.#monitoringInterval) {
      clearInterval(this.#monitoringInterval);
      this.#monitoringInterval = null;
    }
  }

  /** Handle incoming bytes/strings from the transport. Implemented by subclasses. */
  abstract handleResponse(data: Uint8Array): void;

  protected abstract buildReadRequest(config: ModbusReadConfig): Uint8Array;
  protected abstract buildWriteRequest(config: ModbusWriteConfig): Uint8Array;
  protected abstract processBufferedData(): void;

  /**
   * Construct a `ModbusResponse` object from raw pieces.
   *
   * @param slaveId - Slave identifier
   * @param functionCode - Function code (without exception bit)
   * @param data - Raw payload bytes
   */
  protected createResponse(
    slaveId: number,
    functionCode: number,
    data: number[],
  ): ModbusResponse {
    return {
      data,
      functionCode,
      functionCodeLabel: isValidFunctionCode(functionCode)
        ? FUNCTION_CODE_LABELS[functionCode]
        : `Unknown (${functionCode})`,
      slaveId,
      timestamp: new Date(),
    };
  }

  /** Complete and resolve the currently pending request with a response. */
  protected completePendingRequest(response: ModbusResponse) {
    if (!this.pendingRequest) return;

    this.pendingRequest.resolve(response);
    this.pendingRequest = null;
  }

  /** Reject and clear the currently pending request with an error. */
  protected rejectPendingRequest(error: Error) {
    if (!this.pendingRequest) return;

    this.pendingRequest.reject(error);
    this.pendingRequest = null;
  }

  /**
   * Check whether the provided slaveId/functionCode pair matches the
   * currently pending request. Exception frames (function|0x80) are treated
   * as matching when the underlying function code equals the pending one.
   */
  protected isPendingRequestMatching(
    slaveId: number,
    functionCode: number,
  ): boolean {
    return !!(
      this.pendingRequest &&
      this.pendingRequest.slaveId === slaveId &&
      (this.pendingRequest.functionCode === functionCode ||
        (functionCode & 0x80 &&
          (functionCode & 0x7f) === this.pendingRequest.functionCode))
    );
  }
}
