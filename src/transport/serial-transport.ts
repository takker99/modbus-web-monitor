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
/**
 * Concrete transport backed by the Web Serial API.
 *
 * Responsibilities:
 * - Port selection delegation to {@link SerialManager}
 * - Propagating SerialManager events as transport events
 * - Minimal state machine bridging imperative connect/disconnect lifecycle
 */
export class SerialTransport implements IModbusTransport {
  #serialManager: SerialManager;
  #state: TransportState = "disconnected";
  readonly #target = new EventTarget();

  /** For test case */
  protected get serialManager(): SerialManager {
    return this.#serialManager;
  }

  /** For test case */
  protected set state(state: TransportState) {
    this.#state = state;
  }

  constructor(
    public readonly config: SerialTransportConfig,
    serialManager?: SerialManager,
  ) {
    this.#serialManager = serialManager ?? new SerialManager();
    this.setupSerialManagerEvents();
  }

  get state(): TransportState {
    return this.#state;
  }

  get connected(): boolean {
    return this.#state === "connected";
  }

  /** Open (or re-open) the underlying serial port. Idempotent. */
  async connect(): Promise<void> {
    if (this.#state === "connected") {
      return;
    }

    this.setState("connecting");

    try {
      // Select port if not already selected
      await this.#serialManager.selectPort();

      // Convert transport config to serial config
      const serialConfig: SerialConfig = {
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        parity: this.config.parity,
        stopBits: this.config.stopBits,
      };

      await this.#serialManager.connect(serialConfig);
      // State will be set to "connected" by the event handler
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  /** Close the underlying port if open. Safe to call repeatedly. */
  async disconnect(): Promise<void> {
    if (this.#state === "disconnected") {
      return;
    }

    try {
      await this.#serialManager.disconnect();
      // State will be set to "disconnected" by the event handler
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  /**
   * Send raw bytes to the serial device.
   *
   * Errors encountered during the async write are surfaced via an `error`
   * event (fire-and-forget semantics by design for parity with MessagePort).
   */
  postMessage(data: Uint8Array): void {
    if (this.#state !== "connected") {
      throw new Error("Transport not connected");
    }

    try {
      // underlying serialManager は Promise を返すが上位 API は fire-and-forget
      void this.#serialManager.send(data).catch((error) => {
        this.dispatchError(error as Error);
      });
    } catch (error) {
      this.dispatchError(error as Error);
      throw error;
    }
  }

  private setupSerialManagerEvents(): void {
    this.#serialManager.on("connected", () => {
      this.setState("connected");
      this.dispatch("open");
    });
    this.#serialManager.on("disconnected", () => {
      this.setState("disconnected");
      this.dispatch("close");
    });
    this.#serialManager.on("portDisconnected", () => {
      this.setState("disconnected");
      this.dispatch("close");
    });
    this.#serialManager.on("error", (error: Error) => {
      this.setState("error");
      this.dispatchError(error);
    });
    this.#serialManager.on("data", (data: Uint8Array) => {
      this.dispatchMessage(data);
    });
  }

  private setState(newState: TransportState): void {
    if (this.#state !== newState) {
      this.#state = newState;
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
    this.#target.addEventListener(type, listener as EventListener, options);
  }

  private dispatch(type: keyof TransportEventMap, event?: Event) {
    this.#target.dispatchEvent(event ?? new Event(type));
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
