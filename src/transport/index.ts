// Transport module exports and registration
// This file sets up the transport registry and exports all transport implementations

import { TransportRegistry } from "./transport.ts";
import { SerialTransport } from "./serial-transport.ts";
import { TcpTransport } from "./tcp-transport.ts";
import { MockTransport } from "./mock-transport.ts";

// Register built-in transport implementations
TransportRegistry.register("serial", (config) => {
  if (config.type !== "serial") {
    throw new Error("Invalid config type for serial transport");
  }
  return new SerialTransport(config);
});

TransportRegistry.register("tcp", (config) => {
  if (config.type !== "tcp") {
    throw new Error("Invalid config type for TCP transport");
  }
  return new TcpTransport(config);
});

TransportRegistry.register("mock", (config) => {
  if (config.type !== "mock") {
    throw new Error("Invalid config type for mock transport");
  }
  return new MockTransport(config);
});

// Re-export all transport types and implementations
export type {
  IModbusTransport,
  TransportConfig,
  SerialTransportConfig,
  TcpTransportConfig,
  WebSocketTransportConfig,
  MockTransportConfig,
  TransportState,
  TransportEvents,
  TransportFactory,
} from "./transport.ts";

export { TransportRegistry } from "./transport.ts";
export { SerialTransport } from "./serial-transport.ts";
export { TcpTransport } from "./tcp-transport.ts";
export { MockTransport, type MockTransportOptions } from "./mock-transport.ts";

// Convenience function to create transports
export function createTransport(config: import("./transport.ts").TransportConfig): import("./transport.ts").IModbusTransport {
  return TransportRegistry.create(config);
}