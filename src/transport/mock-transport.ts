// Mock transport implementation for testing
// Provides a controllable transport that can simulate various scenarios

import type {
  IModbusTransport,
  MockTransportConfig,
  TransportEventMap,
  TransportState,
} from "./transport.ts";

export interface MockTransportOptions {
  // Simulate connection delay (ms)
  connectDelay?: number;
  // Simulate disconnection delay (ms)
  disconnectDelay?: number;
  // Simulate send delay (ms)
  sendDelay?: number;
  // Should connection fail?
  shouldFailConnect?: boolean;
  // Should sending fail?
  shouldFailSend?: boolean;
  // Error message for failures
  errorMessage?: string;
  // Auto-response data for sent requests
  autoResponses?: Map<string, Uint8Array>;
}

export class MockTransport implements IModbusTransport {
  private _state: TransportState = "disconnected";
  private options: MockTransportOptions;
  private readonly target = new EventTarget();

  // For testing: manually trigger events
  public sentData: Uint8Array[] = [];

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

    // Simulate connection delay
    const connectDelay = this.options.connectDelay ?? 0;
    if (connectDelay > 0) {
      await this.delay(connectDelay);
    }

    if (this.options.shouldFailConnect) {
      this.setState("error");
      throw new Error(this.options.errorMessage);
    }

    this.setState("connected");
    this.dispatch("open");
  }

  async disconnect(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    // Simulate disconnection delay
    const disconnectDelay = this.options.disconnectDelay ?? 0;
    if (disconnectDelay > 0) {
      await this.delay(disconnectDelay);
    }

    this.setState("disconnected");
    this.dispatch("close");
  }

  postMessage(data: Uint8Array): void {
    if (this._state !== "connected") {
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
          if (this._state === "connected") this.dispatchMessage(response);
        }, 1);
      }
    };
    const sendDelay = this.options.sendDelay ?? 0;
    if (sendDelay > 0) {
      setTimeout(() => {
        if (this._state === "connected") act();
      }, sendDelay);
    } else {
      act();
    }
  }

  // Testing utilities
  public simulateData(data: Uint8Array): void {
    if (this._state === "connected") {
      this.dispatchMessage(data);
    }
  }

  public simulateError(error: Error): void {
    this.setState("error");
    this.dispatchError(error);
  }

  public simulateDisconnect(): void {
    if (this._state === "connected") {
      this.setState("disconnected");
      this.dispatch("close");
    }
  }

  public clearSentData(): void {
    this.sentData = [];
  }

  public getLastSentData(): Uint8Array | undefined {
    return this.sentData[this.sentData.length - 1];
  }

  public getSentDataCount(): number {
    return this.sentData.length;
  }

  // Configure auto-responses for testing
  public setAutoResponse(request: Uint8Array, response: Uint8Array): void {
    const dataKey = Array.from(request).join(",");
    if (!this.options.autoResponses) {
      this.options.autoResponses = new Map();
    }
    this.options.autoResponses.set(dataKey, response);
  }

  public clearAutoResponses(): void {
    this.options.autoResponses?.clear();
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
