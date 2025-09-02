// Mock transport implementation for testing
// Provides a controllable transport that can simulate various scenarios

import type { IModbusTransport, MockTransportConfig } from "./transport.ts";

/** Options controlling test / simulation behaviour of {@link MockTransport}. */
export interface MockTransportOptions {
  /** Artificial delay before a successful connect resolves (ms). */
  connectDelay?: number;
  /** Artificial delay before disconnect completes (ms). */
  disconnectDelay?: number;
  /** Artificial delay applied to `postMessage` (ms). */
  sendDelay?: number;
  /** When true `connect()` will reject with `errorMessage`. */
  shouldFailConnect?: boolean;
  /** When true sending data triggers an error event & throws. */
  shouldFailSend?: boolean;
  /** Error message used for simulated failures. */
  errorMessage?: string;
  /** Predefined auto response map keyed by CSV stringified request bytes. */
  autoResponses?: Map<string, Uint8Array>;
}

/**
 * In‑memory transport used for unit tests and interactive demos.
 *
 * Provides deterministic control over timing, error injection and automatic
 * responses so higher level protocol logic can be validated without actual
 * serial hardware.
 */
export class MockTransport implements IModbusTransport {
  private _connected = false;
  private options: MockTransportOptions;
  private readonly target = new EventTarget();

  // For testing: manually trigger events
  public sentData: Uint8Array[] = [];

  /**
   * Construct a new mock transport.
   * @param config - Mock transport configuration (discriminator only).
   * @param options - Optional behaviour overrides (delays, failures, etc.).
   */
  constructor(
    public readonly config: MockTransportConfig,
    options: MockTransportOptions = {},
  ) {
    this.options = {
      autoResponses: new Map(),
      connectDelay: 0,
      disconnectDelay: 0,
      errorMessage: "Mock transport error",
      sendDelay: 0,
      shouldFailConnect: false,
      shouldFailSend: false,
      ...options,
    };
  }

  /** Current lifecycle state. */
  get connected(): boolean {
    return this._connected;
  }

  /** Establish a simulated connection (optionally delayed / failed). */
  async connect(): Promise<void> {
    if (this._connected) {
      return;
    }

    // Simulate connection delay
    const connectDelay = this.options.connectDelay ?? 0;
    if (connectDelay > 0) {
      await this.delay(connectDelay);
    }

    if (this.options.shouldFailConnect) {
      throw new Error(this.options.errorMessage);
    }
    this._connected = true;
  }

  /** Terminate the simulated connection (optionally delayed). */
  async [Symbol.asyncDispose](): Promise<void> {
    if (!this._connected) {
      return;
    }

    // Simulate disconnection delay
    const disconnectDelay = this.options.disconnectDelay ?? 0;
    if (disconnectDelay > 0) {
      await this.delay(disconnectDelay);
    }

    this._connected = false;
  }

  /** Terminate the simulated connection (optionally delayed). */
  disconnect = this[Symbol.asyncDispose].bind(this);

  /**
   * Send raw bytes through the mock. May trigger an auto response or a
   * simulated failure depending on {@link MockTransportOptions}.
   */
  postMessage(data: Uint8Array): void {
    if (!this._connected) {
      throw new Error("Transport not connected");
    }
    const act = () => {
      if (this.options.shouldFailSend) {
        const error = new Error(this.options.errorMessage);
        this.dispatchError(error);
        throw error;
      }
      this.sentData.push(new Uint8Array(data));
      const dataKey = Array.from(data).join(",");
      const response = this.options.autoResponses?.get(dataKey);
      if (response) {
        setTimeout(() => {
          if (this._connected) this.dispatchMessage(response);
        }, 1);
      }
    };
    const sendDelay = this.options.sendDelay ?? 0;
    if (sendDelay > 0) {
      setTimeout(() => {
        if (this._connected) act();
      }, sendDelay);
    } else {
      act();
    }
  }

  // Testing utilities
  /** Manually inject inbound data as if it was received from the peer. */
  public simulateData(data: Uint8Array): void {
    if (this._connected) {
      this.dispatchMessage(data);
    }
  }

  /** Simulate a transport level error (transitions to `error` state). */
  public simulateError(error: Error): void {
    this._connected = false;
    this.dispatchError(error);
  }

  /** Simulate an abrupt disconnect (fires `close`). */
  public simulateDisconnect(): void {
    if (this._connected) {
      this._connected = false;
    }
  }

  /** Clear all recorded outbound frames. */
  public clearSentData(): void {
    this.sentData = [];
  }

  /** Returns the last recorded outbound frame (if any). */
  public getLastSentData(): Uint8Array | undefined {
    return this.sentData[this.sentData.length - 1];
  }

  /** Count of frames sent since construction / last clear. */
  public getSentDataCount(): number {
    return this.sentData.length;
  }

  // Configure auto-responses for testing
  /**
   * Register an auto response which will be emitted shortly after a matching
   * request is observed.
   */
  public setAutoResponse(request: Uint8Array, response: Uint8Array): void {
    const dataKey = Array.from(request).join(",");
    if (!this.options.autoResponses) {
      this.options.autoResponses = new Map();
    }
    this.options.autoResponses.set(dataKey, response);
  }

  /** Remove all previously registered auto responses. */
  public clearAutoResponses(): void {
    this.options.autoResponses?.clear();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions,
  ): void {
    this.target.addEventListener(type, listener, options);
  }
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions,
  ): void {
    this.target.removeEventListener(type, listener, options);
  }
  dispatchEvent(event: Event): boolean {
    return this.target.dispatchEvent(event);
  }

  private dispatch(type: string, event?: Event) {
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
