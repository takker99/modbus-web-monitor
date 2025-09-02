/**
 * TCP transport implementation for Modbus TCP.
 *
 * Note: This is a placeholder implementation since Web browsers don't
 * support raw TCP sockets. In Node.js this would use `net.Socket`.
 */
import type {
  IModbusTransport,
  TcpTransportConfig,
  TransportEventMap,
  TransportState,
} from "./transport.ts";

export class TcpTransport implements IModbusTransport {
  private _state: TransportState = "disconnected";
  private socket: WebSocket | null = null;
  private readonly target = new EventTarget();

  constructor(public readonly config: TcpTransportConfig) {}

  get state(): TransportState {
    return this._state;
  }

  get connected(): boolean {
    return this._state === "connected";
  }

  /**
   * Establish a TCP (or placeholder) connection. Throws on browsers.
   */
  async connect(): Promise<void> {
    if (this._state === "connected") {
      return;
    }

    this.setState("connecting");

    try {
      // Browsers cannot create raw TCP sockets; instruct users to use a
      // WebSocket bridge for Modbus TCP instead.
      throw new Error(
        "TCP transport not supported in browser environment. Use WebSocket transport with a Modbus TCP bridge server.",
      );
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
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
      this.setState("disconnected");
      this.dispatch("close");
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  postMessage(data: Uint8Array): void {
    if (this._state !== "connected") {
      throw new Error("Transport not connected");
    }

    if (!this.socket) {
      throw new Error("No socket connection");
    }

    try {
      // For Modbus TCP, we would need to add the MBAP header
      // (Transaction ID, Protocol ID, Length, Unit ID)
      // This is a simplified implementation
      this.socket.send(data);
    } catch (error) {
      this.dispatchError(error as Error);
      throw error;
    }
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
  private dispatchError(error: Error) {
    const ev = Object.assign(
      new CustomEvent<Error>("error", { detail: error }),
      { error },
    );
    this.dispatch("error", ev as unknown as Event);
  }
}
