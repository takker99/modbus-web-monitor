// Serial transport implementation using Web Serial API
// Wraps the existing SerialManager to implement the IModbusTransport interface

import { EventEmitter, type SerialConfig, SerialManager } from "../serial.ts";
import type {
  IModbusTransport,
  SerialTransportConfig,
  TransportEvents,
  TransportState,
} from "./transport.ts";

/**
 * Serial transport implementation using Web Serial API.
 * Wraps the existing SerialManager to implement the IModbusTransport interface.
 */
export class SerialTransport
  extends EventEmitter<TransportEvents>
  implements IModbusTransport
{
  private serialManager: SerialManager;
  private _state: TransportState = "disconnected";

  constructor(public readonly config: SerialTransportConfig) {
    super();
    this.serialManager = new SerialManager();
    this.setupSerialManagerEvents();
  }

  get state(): TransportState {
    return this._state;
  }

  get connected(): boolean {
    return this._state === "connected";
  }

  async connect(): Promise<void> {
    if (this._state === "connected") {
      return;
    }

    this.setState("connecting");

    try {
      // Select port if not already selected
      await this.serialManager.selectPort();

      // Convert transport config to serial config
      const serialConfig: SerialConfig = {
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        parity: this.config.parity,
        stopBits: this.config.stopBits,
      };

      await this.serialManager.connect(serialConfig);
      // State will be set to "connected" by the event handler
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    try {
      await this.serialManager.disconnect();
      // State will be set to "disconnected" by the event handler
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  async send(data: Uint8Array): Promise<void> {
    if (this._state !== "connected") {
      throw new Error("Transport not connected");
    }

    try {
      await this.serialManager.send(data);
    } catch (error) {
      this.emit("error", error as Error);
      throw error;
    }
  }

  async reconnect(): Promise<void> {
    if (this._state === "connected") {
      await this.disconnect();
    }

    const serialConfig: SerialConfig = {
      baudRate: this.config.baudRate,
      dataBits: this.config.dataBits,
      parity: this.config.parity,
      stopBits: this.config.stopBits,
    };

    try {
      await this.serialManager.reconnect(serialConfig);
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  private setupSerialManagerEvents(): void {
    this.serialManager.on("connected", () => {
      this.setState("connected");
      this.emit("connect");
    });

    this.serialManager.on("disconnected", () => {
      this.setState("disconnected");
      this.emit("disconnect");
    });

    this.serialManager.on("portDisconnected", () => {
      this.setState("disconnected");
      this.emit("disconnect");
    });

    this.serialManager.on("error", (error: Error) => {
      this.setState("error");
      this.emit("error", error);
    });

    this.serialManager.on("data", (data: Uint8Array) => {
      this.emit("data", data);
    });
  }

  private setState(newState: TransportState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.emit("stateChange", newState);
    }
  }
}
