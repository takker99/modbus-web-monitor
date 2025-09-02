// Serial transport implementation using Web Serial API
// Wraps the existing SerialManager to implement the IModbusTransport interface

import type { IModbusTransport, SerialTransportConfig } from "./transport.ts";

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
export class SerialTransport extends EventTarget implements IModbusTransport {
  #port: SerialPort;

  constructor(
    public readonly config: SerialTransportConfig,
    port: SerialPort,
  ) {
    super();
    this.#port = port;
  }

  #connected = false;
  get connected(): boolean {
    return this.#connected;
  }

  #writer: WritableStreamDefaultWriter | null = null;
  #readerClosed: Promise<void> = Promise.resolve();

  /**
   * Open (or reopen) the selected port with the provided serial configuration.
   * On success starts background reading and exposes a writer.
   */
  async connect(): Promise<void> {
    if (this.#connected) return;
    await this.#port.open(this.config);

    console.log("SerialManager: port opened");

    // Setup reader and writer
    this.#readerClosed = this.#startReading();
    this.#writer = this.#port.writable?.getWriter?.() ?? null;
    this.#connected = true;
  }

  /** Close the underlying port if open. Safe to call repeatedly. */
  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.#connected) return;

    await this.#port.readable?.cancel?.();
    await this.#readerClosed;

    // Close writer
    await this.#writer?.close?.();
    this.#writer?.releaseLock?.();
    await this.#port.close();
    this.#connected = false;
  }

  /** Close the underlying port if open. Safe to call repeatedly. */
  disconnect = this[Symbol.asyncDispose].bind(this);

  /**
   * Send raw bytes to the serial device.
   *
   * Errors encountered during the async write are surfaced via an `error`
   * event (fire-and-forget semantics by design for parity with MessagePort).
   */
  postMessage(data: Uint8Array): void {
    if (!this.#connected) {
      this.dispatchError(new Error("Transport not connected"));
      return;
    }

    if (!this.#writer) {
      this.dispatchError(new Error("Serial port not open"));
      return;
    }
    this.#writer.write(data).catch((error) => {
      this.dispatchError(error as Error);
    });
  }

  private dispatchError(error: Error) {
    const ev = Object.assign(
      new CustomEvent<Error>("error", { detail: error }),
      { error },
    );
    this.dispatchEvent(ev);
  }

  async #startReading(): Promise<void> {
    while (this.#port.readable) {
      const reader = this.#port.readable.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          this.dispatchEvent(new CustomEvent("message", { detail: value }));
        }
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        this.dispatchError(
          new Error(`Data receive error: ${(error as Error).message}`, {
            cause: error,
          }),
        );
        // On stream error, stop outer loop to avoid tight retry on a permanently errored stream.
        break;
      } finally {
        reader.releaseLock();
      }
    }
  }
}
