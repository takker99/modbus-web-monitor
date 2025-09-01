// Transport abstraction for Modbus communication
// Provides a unified interface for different transport types (Serial, TCP, WebSocket)

import type { EventEmitter } from "../serial.ts";

// Transport configuration for different types
export interface SerialTransportConfig {
  type: "serial";
  baudRate: number;
  dataBits: 7 | 8;
  parity: "none" | "even" | "odd";
  stopBits: 1 | 2;
}

export interface TcpTransportConfig {
  type: "tcp";
  host: string;
  port: number;
  timeout?: number;
}

export interface WebSocketTransportConfig {
  type: "websocket";
  url: string;
  protocols?: string[];
}

export interface MockTransportConfig {
  type: "mock";
  name?: string;
}

export type TransportConfig = 
  | SerialTransportConfig 
  | TcpTransportConfig 
  | WebSocketTransportConfig 
  | MockTransportConfig;

// Transport connection state
export type TransportState = "disconnected" | "connecting" | "connected" | "error";

// Transport event types
export interface TransportEvents extends Record<string, unknown[]> {
  stateChange: [TransportState];
  data: [Uint8Array];
  error: [Error];
  connect: [];
  disconnect: [];
}

// Base transport interface that all transport implementations must follow
export interface IModbusTransport extends EventEmitter<TransportEvents> {
  readonly config: TransportConfig;
  readonly state: TransportState;
  readonly connected: boolean;

  // Core transport operations
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(data: Uint8Array): Promise<void>;

  // Optional operations for transport-specific functionality
  reconnect?(): Promise<void>;

  // Event emitter methods (for compatibility)
  on<K extends keyof TransportEvents>(event: K, listener: (...args: TransportEvents[K]) => void): void;
  off<K extends keyof TransportEvents>(event: K, listener: (...args: TransportEvents[K]) => void): void;
  emit<K extends keyof TransportEvents>(event: K, ...args: TransportEvents[K]): void;
}

// Transport factory function type
export type TransportFactory<T extends TransportConfig = TransportConfig> = (
  config: T,
) => IModbusTransport;

// Registry for transport factories
export class TransportRegistry {
  private static factories = new Map<string, TransportFactory>();

  static register<T extends TransportConfig>(
    type: T["type"],
    factory: TransportFactory<T>,
  ): void {
    this.factories.set(type, factory as TransportFactory);
  }

  static create(config: TransportConfig): IModbusTransport {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(`Unknown transport type: ${config.type}`);
    }
    return factory(config);
  }

  static getRegisteredTypes(): string[] {
    return Array.from(this.factories.keys());
  }
}