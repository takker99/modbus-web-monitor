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
 * - Connection lifecycle is intentionally opaque aside from `connected`.
 */

// Transport configuration for different types
/** Configuration for a Web Serial based transport. */
export interface SerialTransportConfig extends SerialOptions {
  type: "serial";
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

// (Legacy TransportState removed – minimal API uses boolean `connected` only.)

// MessagePort-like events: now minimal: 'message', 'error'
/** Event emitted when raw bytes are received from the underlying link. */
export interface TransportMessageEvent extends CustomEvent<Uint8Array> {}
/** Event emitted on transport level errors (I/O, disconnection, etc.). */
export interface TransportErrorEvent extends CustomEvent<Error> {
  /** Shortcut reference to the error object (mirrors WebSocket semantics). */
  readonly error: Error;
}
/** Strongly typed event map used by transports. */
export type TransportEventMap = {
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
export interface IModbusTransport extends AsyncDisposable, EventTarget {
  /** User supplied configuration discriminator for the transport. */
  readonly config: TransportConfig;
  /** Convenience boolean indicates established connection. */
  readonly connected: boolean;

  /** Establish a connection / open underlying resources. */
  connect(): Promise<void>;

  /** Send raw bytes. Implementations may throw if not connected. */
  postMessage(data: Uint8Array): void;
}
