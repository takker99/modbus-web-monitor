// TCP transport implementation for Modbus TCP
// Note: This is a placeholder implementation since Web browsers don't support raw TCP sockets
// In a Node.js environment, this would use actual TCP sockets

import { EventEmitter } from "../serial.ts";
import type {
  IModbusTransport,
  TcpTransportConfig,
  TransportEvents,
  TransportState,
} from "./transport.ts";

export class TcpTransport extends EventEmitter<TransportEvents> implements IModbusTransport {
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

  async connect(): Promise<void> {
    if (this._state === "connected") {
      return;
    }

    this.setState("connecting");

    try {
      // Note: In a browser environment, we can't make raw TCP connections
      // This would typically use WebSocket to a Modbus TCP bridge server
      // For now, this throws an error to indicate the limitation
      
      // In a Node.js environment, this would be:
      // const socket = net.createConnection(this.config.port, this.config.host);
      
      // For browser compatibility, we might use WebSocket to a bridge:
      // const wsUrl = `ws://${this.config.host}:${this.config.port + 1000}/modbus`;
      // this.socket = new WebSocket(wsUrl);
      
      throw new Error(
        "TCP transport not supported in browser environment. " +
        "Use WebSocket transport with a Modbus TCP bridge server."
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