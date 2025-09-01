# Modular Handler System & Request Scheduler

This document explains the new modular handler architecture and request scheduler implemented for the Modbus Web Monitor.

## Architecture Overview

The system is now organized into three main layers:

1. **Individual Handler Files** (`src/handlers/`) - Each Modbus function code has its own dedicated handler
2. **Handler Registry** (`src/handlers/index.ts`) - Central registry for dynamic handler loading and execution
3. **Request Scheduler** (`src/scheduler/`) - Advanced queuing and scheduling system for RTU protocol

## Individual Handlers

Each Modbus function code is now implemented in its own dedicated file:

### Read Handlers
- `read-coils.ts` (FC 01) - Read discrete outputs (coils)
- `read-discrete-inputs.ts` (FC 02) - Read discrete inputs
- `read-holding-registers.ts` (FC 03) - Read holding registers
- `read-input-registers.ts` (FC 04) - Read input registers

### Write Handlers
- `write-single-coil.ts` (FC 05) - Write single coil
- `write-single-register.ts` (FC 06) - Write single register
- `write-multiple-coils.ts` (FC 15) - Write multiple coils
- `write-multiple-registers.ts` (FC 16) - Write multiple registers

### Usage Example

```typescript
import { readCoils } from "./src/handlers/read-coils.ts";
import type { IModbusTransport } from "./src/transport/transport.ts";

const transport: IModbusTransport = // ... your transport
const result = await readCoils(transport, {
  unitId: 1,
  address: 0,
  quantity: 10,
}, {
  timeout: 3000,
  protocol: "rtu"
});

if (result.success) {
  console.log("Data:", result.data.data);
} else {
  console.error("Error:", result.error.message);
}
```

## Handler Registry

The `ModbusHandlerRegistry` provides dynamic handler management:

### Basic Usage

```typescript
import { ModbusHandlerRegistry } from "./src/handlers/index.ts";

// Check if a function code is supported
if (ModbusHandlerRegistry.isSupported(3)) {
  // Execute read operation dynamically
  const result = await ModbusHandlerRegistry.executeRead(3, transport, {
    unitId: 1,
    address: 0,
    quantity: 10,
  });
}

// Get all available handlers
const metadata = ModbusHandlerRegistry.getAllHandlerMetadata();
console.log("Available handlers:", metadata.map(m => `FC${m.functionCode}: ${m.name}`));
```

### Handler Discovery

```typescript
// Get handlers by type
const readHandlers = ModbusHandlerRegistry.getHandlersByType("read");
const writeHandlers = ModbusHandlerRegistry.getHandlersByType("write");

// Get handlers by data type
const bitHandlers = ModbusHandlerRegistry.getHandlersByDataType("bit");
const registerHandlers = ModbusHandlerRegistry.getHandlersByDataType("register");
```

## Request Scheduler

The `RequestScheduler` provides advanced queuing and scheduling for RTU protocol:

### Basic Usage

```typescript
import { RequestScheduler, RequestPriority } from "./src/scheduler/index.ts";

const scheduler = new RequestScheduler(transport, {
  maxConcurrentRequests: 1, // RTU requires serialization
  defaultTimeout: 3000,
  queueSizeLimit: 100,
  requestIntervalMs: 10, // Minimum interval between requests
});

scheduler.start();

// Schedule requests with priority
const result = await scheduler.scheduleRead(3, {
  unitId: 1,
  address: 0,
  quantity: 10,
}, {}, RequestPriority.HIGH);
```

### Priority System

The scheduler supports four priority levels:

```typescript
enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}
```

Higher priority requests are processed first.

### Retry Configuration

```typescript
const retryOptions = {
  maxRetries: 3,
  baseDelay: 100,
  exponentialBackoff: true,
  retryableErrors: ["ModbusTimeoutError", "NetworkError"],
};

const result = await scheduler.scheduleRead(3, request, {}, RequestPriority.NORMAL, retryOptions);
```

### Statistics and Monitoring

```typescript
const stats = scheduler.getStats();
console.log("Queue length:", stats.queueLength);
console.log("Success rate:", stats.successfulRequests / stats.totalRequests);
console.log("Average response time:", stats.averageResponseTime);

// Inspect queue contents
const queueContents = scheduler.getQueueContents();
console.log("Pending requests:", queueContents.length);
```

## Advanced Error Handling

### Enhanced Error Context

All handlers now provide detailed error context:

```typescript
import { ModbusContextError } from "./src/handlers/common.ts";

try {
  const result = await readCoils(transport, request);
  if (!result.success && result.error instanceof ModbusContextError) {
    console.log("Error context:", {
      phase: result.error.context.phase,
      timestamp: result.error.context.timestamp,
      unitId: result.error.context.unitId,
      protocol: result.error.context.protocol,
    });
  }
} catch (error) {
  // Handle unexpected errors
}
```

### Error Recovery Strategies

The `executeWithRetry` utility provides configurable retry logic:

```typescript
import { executeWithRetry } from "./src/handlers/common.ts";

const result = await executeWithRetry(
  () => readCoils(transport, request),
  {
    maxRetries: 3,
    baseDelay: 100,
    exponentialBackoff: true,
    retryableErrors: ["ModbusTimeoutError", "NetworkError"],
  }
);
```

## Parameter Validation

All handlers include comprehensive parameter validation:

- **Address validation**: 0-65535 range
- **Quantity limits**: 
  - Coils: 1-2000 for reads, 1-1968 for writes
  - Registers: 1-125 for reads, 1-123 for writes
- **Value validation**: 16-bit range for registers (0-65535)
- **Array validation**: Non-empty arrays for multi-write operations

## Integration with Existing Code

The new system is designed to be backward compatible:

1. **Existing code continues to work** - All existing APIs remain functional
2. **Gradual migration** - You can adopt the new handlers incrementally
3. **Transport abstraction** - Works with all existing transport types
4. **Result type compatibility** - Uses the same Result<T, E> pattern

## Performance Considerations

- **Request serialization**: RTU protocol requires sequential request processing
- **Memory efficiency**: Queue size limits prevent memory leaks
- **Response time tracking**: Built-in performance monitoring
- **Connection pooling**: Transport reuse across handlers

## Testing

Each handler includes comprehensive parameter validation and error handling:

```typescript
// Example test usage
import { readCoils } from "./src/handlers/read-coils.ts";
import { MockTransport } from "./src/transport/mock-transport.ts";

const transport = new MockTransport(config);
await transport.connect();

const result = await readCoils(transport, {
  unitId: 1,
  address: 0,
  quantity: 10,
});

// Results are always wrapped in Result<T, Error> type
if (result.success) {
  // Handle success case
} else {
  // Handle error case
}
```

This modular architecture provides better maintainability, testability, and extensibility while maintaining full backward compatibility with existing code.