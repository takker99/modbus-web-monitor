// Transport module exports and registration
// Sets up the transport registry and exports transport implementations

import { MockTransport } from "./mock-transport.ts";
import { SerialTransport } from "./serial-transport.ts";
import { TcpTransport } from "./tcp-transport.ts";
import { TransportRegistry } from "./transport.ts";

/**
 * Register the built-in transports with the TransportRegistry.
 *
 * Each factory validates the incoming config and returns a transport
 * instance appropriate for the runtime.
 */
TransportRegistry.register("serial", (config) => {
  if (config.type !== "serial") {
    throw new Error("Invalid config type for serial transport");
  }
  return new SerialTransport(config);
});

TransportRegistry.register("tcp", (config) => {
  if (config.type !== "tcp") {
    throw new Error("Invalid config type for tcp transport");
  }
  return new TcpTransport(config);
});

TransportRegistry.register("mock", (config) => {
  if (config.type !== "mock") {
    throw new Error("Invalid config type for mock transport");
  }
  return new MockTransport(config);
});

export { MockTransport, type MockTransportOptions } from "./mock-transport.ts";
export { SerialTransport } from "./serial-transport.ts";
export { TcpTransport } from "./tcp-transport.ts";
// Re-export transport types and implementations for consumers
export type {
  IModbusTransport,
  MockTransportConfig,
  SerialTransportConfig,
  TcpTransportConfig,
  TransportConfig,
  TransportEvents,
  TransportFactory,
  TransportState,
  WebSocketTransportConfig,
} from "./transport.ts";
export { TransportRegistry } from "./transport.ts";

// Convenience helper to create transports via the registry
export function createTransport(
  config: import("./transport.ts").TransportConfig,
): import("./transport.ts").IModbusTransport {
  return TransportRegistry.create(config);
}
