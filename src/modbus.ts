/**
 * High-level Modbus client entry points and backward-compatible exports.
 */
import type { ModbusProtocol } from "./frameBuilder.ts";
import type { ReadFunctionCode, WriteFunctionCode } from "./functionCodes.ts";
import { ModbusASCIIClient } from "./modbus-ascii.ts";
import type {
  ModbusReadConfig as BaseModbusReadConfig,
  ModbusWriteConfig as BaseModbusWriteConfig,
  ModbusResponse,
} from "./modbus-base.ts";
import { ModbusRTUClient } from "./modbus-rtu.ts";
import { EventEmitter } from "./serial.ts";

/** Export protocol-specific clients for tree-shaking. */
export { ModbusASCIIClient } from "./modbus-ascii.ts";
export { ModbusClientBase } from "./modbus-base.ts";
export { ModbusRTUClient } from "./modbus-rtu.ts";

/**
 * Re-exported read config compatible with older public API.
 */
export interface ModbusReadConfig {
  slaveId: number;
  functionCode: ReadFunctionCode;
  startAddress: number;
  quantity: number;
}

/**
 * Re-exported write config compatible with older public API.
 */
export interface ModbusWriteConfig {
  slaveId: number;
  functionCode: WriteFunctionCode;
  address: number;
  value: number | number[];
}

// Re-export ModbusResponse for backward compatibility.
export type { ModbusResponse };

// Export transport and pure-function APIs.
export * from "./api/pure-functions.ts";
export * from "./transport/index.ts";
export * from "./types/result.ts";

type ModbusClientEvents = {
  response: [ModbusResponse];
  error: [Error];
  request: [Uint8Array];
};

/**
 * Backward-compatible ModbusClient that delegates to protocol-specific
 * implementations (RTU or ASCII). Events from the underlying clients are
 * forwarded to this wrapper instance.
 */
export class ModbusClient extends EventEmitter<ModbusClientEvents> {
  #protocol: ModbusProtocol = "rtu";
  #rtuClient: ModbusRTUClient;
  #asciiClient: ModbusASCIIClient;
  #monitoringInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.#rtuClient = new ModbusRTUClient();
    this.#asciiClient = new ModbusASCIIClient();
    this.#setupDelegation();
  }

  set protocol(protocol: ModbusProtocol) {
    this.#protocol = protocol;
  }

  get protocol(): ModbusProtocol {
    return this.#protocol;
  }

  async read(config: ModbusReadConfig): Promise<ModbusResponse> {
    return this.#getActiveClient().read(config as BaseModbusReadConfig);
  }

  async write(config: ModbusWriteConfig): Promise<void> {
    return this.#getActiveClient().write(config as BaseModbusWriteConfig);
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

  handleResponse(data: Uint8Array) {
    this.#getActiveClient().handleResponse(data);
  }

  #getActiveClient() {
    return this.#protocol === "rtu" ? this.#rtuClient : this.#asciiClient;
  }

  #setupDelegation() {
    // Forward events from both clients to this instance
    for (const client of [this.#rtuClient, this.#asciiClient]) {
      client.on("response", (response: ModbusResponse) => {
        this.emit("response", response);
      });

      client.on("error", (error: Error) => {
        this.emit("error", error);
      });

      client.on("request", (data: Uint8Array) => {
        this.emit("request", data);
      });
    }
  }
}
