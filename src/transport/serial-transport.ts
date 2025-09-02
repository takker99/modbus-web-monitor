// Serial transport implementation using Web Serial API
// Wraps the existing SerialManager to implement the IModbusTransport interface

import { type SerialConfig, SerialManager } from "../serial.ts";
import type {
  IModbusTransport,
  SerialTransportConfig,
  TransportEventMap,
  TransportState,
} from "./transport.ts";

/**
 * Serial transport implementation using Web Serial API.
 * Wraps the existing SerialManager to implement the IModbusTransport interface.
 */
export class SerialTransport implements IModbusTransport {
  private serialManager: SerialManager;
  private _state: TransportState = "disconnected";
  private readonly target = new EventTarget();

  constructor(public readonly config: SerialTransportConfig) {
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

  postMessage(data: Uint8Array): void {
    if (this._state !== "connected") {
      throw new Error("Transport not connected");
    }

    try {
      // underlying serialManager は Promise を返すが上位 API は fire-and-forget
      void this.serialManager.send(data).catch((error) => {
        this.dispatchError(error as Error);
      });
    } catch (error) {
      this.dispatchError(error as Error);
      throw error;
    }
  }

  // reconnect は新APIでは削除 (必要なら外部で connect/disconnect を連続呼び出し)

  private setupSerialManagerEvents(): void {
    this.serialManager.on("connected", () => {
      this.setState("connected");
      this.dispatch("open");
    });
    this.serialManager.on("disconnected", () => {
      this.setState("disconnected");
      this.dispatch("close");
    });
    this.serialManager.on("portDisconnected", () => {
      this.setState("disconnected");
      this.dispatch("close");
    });
    this.serialManager.on("error", (error: Error) => {
      this.setState("error");
      this.dispatchError(error);
    });
    this.serialManager.on("data", (data: Uint8Array) => {
      this.dispatchMessage(data);
    });
  }

  private setState(newState: TransportState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.dispatch(
        "statechange",
        new CustomEvent("statechange", { detail: newState }),
      );
    }
  }

  addEventListener<K extends keyof TransportEventMap>(
    type: K,
    listener: (ev: TransportEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    this.target.addEventListener(type, listener as EventListener, options);
  }

  private dispatch(type: keyof TransportEventMap, event?: Event) {
    this.target.dispatchEvent(event ?? new Event(type));
  }
  private dispatchMessage(data: Uint8Array) {
    const ev = new CustomEvent<Uint8Array>("message", { detail: data });
    this.dispatch("message", ev);
  }
  private dispatchError(error: Error) {
    const ev = Object.assign(
      new CustomEvent<Error>("error", { detail: error }),
      { error },
    );
    this.dispatch("error", ev as unknown as Event);
  }
}
