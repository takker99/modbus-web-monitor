// Transport abstraction for Modbus communication (MessagePort-like)
// EventEmitter を廃止し DOM EventTarget 風 API のみ提供する。

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
  // timeout は API から排除 (利用者が AbortSignal を用意)
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
export type TransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

// MessagePort-like events: 'open', 'close', 'statechange', 'message', 'error'
export interface TransportMessageEvent extends CustomEvent<Uint8Array> {}
export interface TransportErrorEvent extends CustomEvent<Error> {
  readonly error: Error;
}
export type TransportEventMap = {
  open: Event;
  close: Event;
  statechange: CustomEvent<TransportState>; // detail に新 state
  message: TransportMessageEvent; // detail に受信データ
  error: TransportErrorEvent; // detail/error にエラー
};

export interface IModbusTransport {
  readonly config: TransportConfig;
  readonly state: TransportState;
  readonly connected: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  postMessage(data: Uint8Array): void;
  addEventListener<K extends keyof TransportEventMap>(
    type: K,
    listener: (ev: TransportEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
}

// Transport factory function type
export type TransportFactory<T extends TransportConfig = TransportConfig> = (
  config: T,
) => IModbusTransport;

// Registry for transport factories
// Registry implemented as module-scoped map + exported helper functions.
const factories = new Map<string, TransportFactory>();

export const TransportRegistry = {
  create(config: TransportConfig): IModbusTransport {
    const factory = factories.get(config.type);
    if (!factory) {
      throw new Error(`Unknown transport type: ${config.type}`);
    }
    return factory(config);
  },

  getRegisteredTypes(): string[] {
    return Array.from(factories.keys());
  },
  register<T extends TransportConfig>(
    type: T["type"],
    factory: TransportFactory<T>,
  ) {
    factories.set(type, factory as TransportFactory);
  },
} as const;
