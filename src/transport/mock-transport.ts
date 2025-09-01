// Mock transport implementation for testing
// Provides a controllable transport that can simulate various scenarios

import { EventEmitter } from "../serial.ts";
import type {
  IModbusTransport,
  MockTransportConfig,
  TransportEvents,
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

export class MockTransport
  extends EventEmitter<TransportEvents>
  implements IModbusTransport
{
  private _state: TransportState = "disconnected";
  private options: MockTransportOptions;

  // For testing: manually trigger events
  public sentData: Uint8Array[] = [];

  constructor(
    public readonly config: MockTransportConfig,
    options: MockTransportOptions = {},
  ) {
    super();
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
    this.emit("connect");
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
    this.emit("disconnect");
  }

  async send(data: Uint8Array): Promise<void> {
    if (this._state !== "connected") {
      throw new Error("Transport not connected");
    }

    // Simulate send delay
    const sendDelay = this.options.sendDelay ?? 0;
    if (sendDelay > 0) {
      await this.delay(sendDelay);
    }

    if (this.options.shouldFailSend) {
      const error = new Error(this.options.errorMessage);
      this.emit("error", error);
      throw error;
    }

    // Record sent data for testing
    this.sentData.push(new Uint8Array(data));

    // Check for auto-response
    const dataKey = Array.from(data).join(",");
    const response = this.options.autoResponses?.get(dataKey);
    if (response) {
      // Emit response after a small delay to simulate real transport
      setTimeout(() => {
        this.emit("data", response);
      }, 1);
    }
  }

  // Testing utilities
  public simulateData(data: Uint8Array): void {
    if (this._state === "connected") {
      this.emit("data", data);
    }
  }

  public simulateError(error: Error): void {
    this.setState("error");
    this.emit("error", error);
  }

  public simulateDisconnect(): void {
    if (this._state === "connected") {
      this.setState("disconnected");
      this.emit("disconnect");
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
      this.emit("stateChange", newState);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
