/**
 * TCP transport implementation for Modbus TCP.
 *
 * Note: This is a placeholder implementation since Web browsers don't
 * support raw TCP sockets. In Node.js this would use `net.Socket`.
 */
import type { IModbusTransport, TcpTransportConfig } from "./transport.ts";

/** Placeholder implementation for Modbus TCP (not usable in browsers). */
export class TcpTransport implements IModbusTransport {
  private _connected = false;
  private socket: WebSocket | null = null;
  private readonly target = new EventTarget();

  constructor(public readonly config: TcpTransportConfig) {}

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Establish a TCP (or placeholder) connection. Throws on browsers.
   */
  /** Attempt to establish a TCP connection (always fails in browsers). */
  async connect(): Promise<void> {
    // Always unsupported in browser environment – keep API parity.
    if (this._connected) return;
    throw new Error(
      "TCP transport not supported in browser environment. Use a bridge (e.g. WebSocket proxy).",
    );
  }

  /** Close the (placeholder) socket if present. */
  async [Symbol.asyncDispose](): Promise<void> {
    if (!this._connected) return;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this._connected = false;
  }

  /** Close the (placeholder) socket if present. */
  disconnect = this[Symbol.asyncDispose].bind(this);

  /** Send raw bytes over the (unsupported) TCP channel. */
  postMessage(_data: Uint8Array): void {
    throw new Error("TCP transport not connected");
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
}
