/**
 * TCP transport implementation for Modbus TCP.
 *
 * Note: This is a placeholder implementation since Web browsers don't
 * support raw TCP sockets. In Node.js this would use `net.Socket`.
 */
import { EventEmitter } from "../serial.ts";
import type {
  IModbusTransport,
  TcpTransportConfig,
  TransportEvents,
  TransportState,
} from "./transport.ts";

export class TcpTransport
  extends EventEmitter<TransportEvents>
  implements IModbusTransport
{
  private _state: TransportState = "disconnected";
  private socket: WebSocket | null = null;

  constructor(public readonly config: TcpTransportConfig) {
    super();
  }

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
      this.emit("disconnect");
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  async send(data: Uint8Array): Promise<void> {
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
      this.emit("error", error as Error);
      throw error;
    }
  }

  private setState(newState: TransportState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.emit("stateChange", newState);
    }
  }
}
