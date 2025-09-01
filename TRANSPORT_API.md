# Transport Abstraction & Pure Function API

This document demonstrates the new transport abstraction and pure function API introduced alongside the existing class-based API.

## Transport Abstraction

The transport abstraction provides a unified interface for different communication methods:

### Available Transports

- **SerialTransport** - Web Serial API wrapper
- **TcpTransport** - Modbus TCP (placeholder in browser)
- **MockTransport** - For testing and development

### Basic Usage

```typescript
import { createTransport, type SerialTransportConfig } from "./src/transport/index.ts";

// Create a serial transport
const config: SerialTransportConfig = {
  type: "serial",
  baudRate: 9600,
  dataBits: 8,
  parity: "none",
  stopBits: 1,
};

const transport = createTransport(config);

// Connect and use
await transport.connect();
console.log("Connected:", transport.connected);

// Listen for data
transport.on("data", (data: Uint8Array) => {
  console.log("Received:", Array.from(data));
});

// Send data
const frame = new Uint8Array([1, 3, 0, 0, 0, 1, 0x84, 0x0A]);
await transport.send(frame);
```

### Mock Transport for Testing

```typescript
import { MockTransport, type MockTransportConfig } from "./src/transport/index.ts";

const config: MockTransportConfig = {
  type: "mock",
  name: "test-device",
};

const transport = new MockTransport(config, {
  connectDelay: 100,
  sendDelay: 50,
});

await transport.connect();

// Set up auto-responses for testing
const request = new Uint8Array([1, 3, 0, 0, 0, 1]);
const response = new Uint8Array([1, 3, 2, 0x12, 0x34]);
transport.setAutoResponse(request, response);

// Simulate data
transport.simulateData(new Uint8Array([1, 2, 3]));
```

## Pure Function API

The pure function API provides a functional alternative to the class-based approach, working directly with transports and returning `Result<T, Error>` for better error handling.

### Reading Data

```typescript
import {
  readCoils,
  readDiscreteInputs, 
  readHoldingRegisters,
  readInputRegisters,
} from "./src/api/pure-functions.ts";
import { isOk, isErr } from "./src/types/result.ts";

// Read holding registers
const result = await readHoldingRegisters(transport, 1, 0, 10);

if (isOk(result)) {
  console.log("Read successful:", result.data);
  console.log("Data:", result.data.data);
  console.log("Function:", result.data.functionCodeLabel);
} else {
  console.error("Read failed:", result.error.message);
}

// Read with options
const result2 = await readCoils(transport, 1, 0, 16, {
  timeout: 5000,
  protocol: "ascii"
});
```

### Writing Data

```typescript
import {
  writeSingleCoil,
  writeSingleRegister,
  writeMultipleCoils,
  writeMultipleRegisters,
} from "./src/api/pure-functions.ts";

// Write single coil
const result1 = await writeSingleCoil(transport, 1, 0, true);

// Write single register  
const result2 = await writeSingleRegister(transport, 1, 100, 0x1234);

// Write multiple coils
const result3 = await writeMultipleCoils(transport, 1, 0, [true, false, true]);

// Write multiple registers
const result4 = await writeMultipleRegisters(transport, 1, 0, [0x1234, 0x5678]);

// Handle results
for (const result of [result1, result2, result3, result4]) {
  if (isErr(result)) {
    console.error("Write failed:", result.error);
  }
}
```

## Result Type

The `Result<T, E>` type provides functional error handling without exceptions:

```typescript
import { 
  ok, 
  err, 
  map, 
  andThen, 
  unwrapOr,
  fromPromise 
} from "./src/types/result.ts";

// Create results
const success = ok(42);
const failure = err(new Error("Something went wrong"));

// Transform data
const doubled = map(success, x => x * 2); // Ok(84)

// Chain operations
const chained = andThen(success, x => 
  x > 0 ? ok(x.toString()) : err(new Error("Negative number"))
);

// Provide defaults
const value = unwrapOr(failure, "default");

// Convert promises
const resultFromPromise = await fromPromise(fetch("/api/data"));
```

## Combining Both APIs

You can use both the class-based and functional APIs together:

```typescript
// Class-based API (existing)
import { ModbusClient } from "./src/modbus.ts";

const client = new ModbusClient();
client.protocol = "rtu";

client.on("response", (response) => {
  console.log("Class API response:", response);
});

// Pure function API (new)
import { readHoldingRegisters } from "./src/api/pure-functions.ts";
import { SerialTransport } from "./src/transport/index.ts";

const transport = new SerialTransport({
  type: "serial",
  baudRate: 9600,
  dataBits: 8,
  parity: "none",
  stopBits: 1,
});

await transport.connect();

const result = await readHoldingRegisters(transport, 1, 0, 5);
if (isOk(result)) {
  console.log("Functional API result:", result.data);
}
```

## Benefits

### Transport Abstraction
- **Cross-platform compatibility** - Same API for different transport types
- **Better testing** - Mock transport for unit tests
- **Future extensibility** - Easy to add WebSocket, USB, etc.

### Pure Function API
- **Functional programming** - No side effects, composable functions
- **Better error handling** - Result type instead of exceptions
- **Type safety** - Full TypeScript support
- **Testability** - Pure functions are easy to test

### Backward Compatibility
- All existing code continues to work
- Gradual migration possible
- Tree-shaking friendly - only import what you use