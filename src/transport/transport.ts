/**
 * Transport abstraction for Modbus communication (MessagePort-like interface).
 *
 * This layer provides a small, implementation‑agnostic contract used by the
 * RTU / ASCII pure function APIs. Implementations deliberately mirror a
 * subset of the browser `MessagePort`/`WebSocket` style so they are easy to
 * reason about and can be swapped (Serial / Mock / future WebSocket, etc.).
 *
 * Design notes:
 * - Uses DOM `addEventListener` semantics instead of a custom EventEmitter
 * - Narrow surface: `connect()`, `disconnect()`, `postMessage()`
 * - All inbound data is delivered as `Uint8Array` via `message` events.
 * - State changes are observable via a dedicated `statechange` event whose
 *   `detail` carries the new {@link TransportState}.
 */

// Transport configuration for different types
/** Configuration for a Web Serial based transport. */
export interface SerialTransportConfig {
  type: "serial";
  baudRate: number;
  dataBits: 7 | 8;
  parity: "none" | "even" | "odd";
  stopBits: 1 | 2;
}

/** Configuration for a (placeholder) TCP transport. */
export interface TcpTransportConfig {
  type: "tcp";
  host: string;
  port: number;
  // timeout は API から排除 (利用者が AbortSignal を用意)
}

/** Configuration for a (future) WebSocket transport. */
export interface WebSocketTransportConfig {
  type: "websocket";
  url: string;
  protocols?: string[];
}

/** Configuration for the in‑memory / test oriented mock transport. */
export interface MockTransportConfig {
  type: "mock";
  name?: string;
}

/** Discriminated union of all supported transport configuration objects. */
export type TransportConfig =
  | SerialTransportConfig
  | TcpTransportConfig
  | WebSocketTransportConfig
  | MockTransportConfig;

// Transport connection state
/** Lifecycle states reported by a transport. */
export type TransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

// MessagePort-like events: 'open', 'close', 'statechange', 'message', 'error'
/** Event emitted when raw bytes are received from the underlying link. */
export interface TransportMessageEvent extends CustomEvent<Uint8Array> {}
/** Event emitted on transport level errors (I/O, disconnection, etc.). */
export interface TransportErrorEvent extends CustomEvent<Error> {
  /** Shortcut reference to the error object (mirrors WebSocket semantics). */
  readonly error: Error;
}
/** Strongly typed event map used by transports. */
export type TransportEventMap = {
  /** Fired after a successful `connect()`. */
  open: Event;
  /** Fired after a successful `disconnect()` or unexpected closure. */
  close: Event;
  /** Fired whenever {@link TransportState} transitions. New state in `detail`. */
  statechange: CustomEvent<TransportState>;
  /** Fired for each received binary message (raw Modbus frame bytes). */
  message: TransportMessageEvent;
  /** Fired on I/O errors; the error is available via `detail` and `.error`. */
  error: TransportErrorEvent;
};

/**
 * Minimal contract implemented by every transport.
 *
 * Implementations should be side‑effect free except for I/O; no internal
 * buffering guarantees are required beyond emitting raw frames as they are
 * observed on the underlying medium.
 */
export interface IModbusTransport {
  /** User supplied configuration discriminator for the transport. */
  readonly config: TransportConfig;
  /** Current lifecycle state. */
  readonly state: TransportState;
  /** Convenience boolean alias for `state === "connected"`. */
  readonly connected: boolean;

  /** Establish a connection / open underlying resources. */
  connect(): Promise<void>;
  /** Gracefully close the transport if open. */
  disconnect(): Promise<void>;
  /** Send raw bytes. Implementations may throw if not connected. */
  postMessage(data: Uint8Array): void;
  /** Register an event listener. */
  addEventListener<K extends keyof TransportEventMap>(
    type: K,
    listener: (ev: TransportEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
}

// Transport factory function type
/** Factory function responsible for instantiating a transport for `config`. */
export type TransportFactory<T extends TransportConfig = TransportConfig> = (
  config: T,
) => IModbusTransport;

// Registry for transport factories
// Registry implemented as module-scoped map + exported helper functions.
/** Internal registry of lazily registered transport factories. */
const factories = new Map<string, TransportFactory>();

/**
 * Public registry helper for managing available transports.
 *
 * Typical usage: `TransportRegistry.register("serial", cfg => new SerialTransport(cfg))`.
 */
export const TransportRegistry = {
  /** Create a concrete transport instance for the given config. */
  create(config: TransportConfig): IModbusTransport {
    const factory = factories.get(config.type);
    if (!factory) {
      throw new Error(`Unknown transport type: ${config.type}`);
    }
    return factory(config);
  },

  /** List currently registered transport type discriminators. */
  getRegisteredTypes(): string[] {
    return Array.from(factories.keys());
  },
  /** Register (or overwrite) a transport factory for a given discriminator. */
  register<T extends TransportConfig>(
    type: T["type"],
    factory: TransportFactory<T>,
  ) {
    factories.set(type, factory as TransportFactory);
  },
} as const;
