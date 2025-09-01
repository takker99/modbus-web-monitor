import {
  ModbusBusyError,
  ModbusTimeoutError,
} from "./errors.ts";
import type { ModbusProtocol } from "./frameBuilder.ts";
import {
  FUNCTION_CODE_LABELS,
  isValidFunctionCode,
} from "./functionCodes.ts";
import { EventEmitter } from "./serial.ts";

export interface ModbusResponse {
  slaveId: number;
  functionCode: number;
  functionCodeLabel: string; // Human-readable label for the function code
  data: number[];
  address?: number;
  timestamp: Date;
}

export interface ModbusReadConfig {
  slaveId: number;
  functionCode: 1 | 2 | 3 | 4;
  startAddress: number;
  quantity: number;
}

export interface ModbusWriteConfig {
  slaveId: number;
  functionCode: 5 | 6 | 15 | 16;
  address: number;
  value: number | number[];
}

// Event types for ModbusClient
type ModbusClientEvents = {
  response: [ModbusResponse];
  error: [Error];
  request: [Uint8Array];
};

// Base class for Modbus clients with common functionality
export abstract class ModbusClientBase extends EventEmitter<ModbusClientEvents> {
  protected pendingRequest: {
    slaveId: number;
    functionCode: number;
    resolve: (response: ModbusResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;
  
  #monitoringInterval: ReturnType<typeof setInterval> | null = null;

  abstract get protocol(): ModbusProtocol;

  async read(config: ModbusReadConfig): Promise<ModbusResponse> {
    return new Promise((resolve, reject) => {
      if (this.pendingRequest) {
        reject(new ModbusBusyError());
        return;
      }

      const request = this.buildReadRequest(config);
      this.pendingRequest = {
        functionCode: config.functionCode,
        reject,
        resolve,
        slaveId: config.slaveId,
        timeout: setTimeout(() => {
          this.pendingRequest = null;
          reject(new ModbusTimeoutError());
        }, 3000),
      };

      this.emit("request", request);

      // Check if there's already buffered data that might contain our response
      this.processBufferedData();
    });
  }

  async write(config: ModbusWriteConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pendingRequest) {
        reject(new ModbusBusyError());
        return;
      }

      const request = this.buildWriteRequest(config);
      this.pendingRequest = {
        functionCode: config.functionCode,
        reject,
        resolve: () => resolve(),
        slaveId: config.slaveId,
        timeout: setTimeout(() => {
          this.pendingRequest = null;
          reject(new ModbusTimeoutError());
        }, 3000),
      };

      this.emit("request", request);
    });
  }

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

  stopMonitoring() {
    if (this.#monitoringInterval) {
      clearInterval(this.#monitoringInterval);
      this.#monitoringInterval = null;
    }
  }

  abstract handleResponse(data: Uint8Array): void;

  protected abstract buildReadRequest(config: ModbusReadConfig): Uint8Array;
  protected abstract buildWriteRequest(config: ModbusWriteConfig): Uint8Array;
  protected abstract processBufferedData(): void;

  protected createResponse(slaveId: number, functionCode: number, data: number[]): ModbusResponse {
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

  protected completePendingRequest(response: ModbusResponse) {
    if (!this.pendingRequest) return;

    clearTimeout(this.pendingRequest.timeout);
    this.pendingRequest.resolve(response);
    this.pendingRequest = null;
  }

  protected rejectPendingRequest(error: Error) {
    if (!this.pendingRequest) return;

    clearTimeout(this.pendingRequest.timeout);
    this.pendingRequest.reject(error);
    this.pendingRequest = null;
  }

  protected isPendingRequestMatching(slaveId: number, functionCode: number): boolean {
    return !!(
      this.pendingRequest &&
      this.pendingRequest.slaveId === slaveId &&
      // 許可: 通常関数コード または 例外フレーム(function | 0x80)
      (this.pendingRequest.functionCode === functionCode ||
        (functionCode & 0x80 &&
          (functionCode & 0x7f) === this.pendingRequest.functionCode))
    );
  }
}