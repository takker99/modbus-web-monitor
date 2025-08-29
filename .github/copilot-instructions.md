# Copilot Instructions for Modbus Web Monitor

## Project Overview

This is a **TypeScript/Preact web application** that provides a browser-based Modbus RTU/ASCII communication monitor and tester. The application uses the **Web Serial API** to communicate directly with serial Modbus devices from Chrome/Chromium browsers.

### Key Technologies
- **Preact** (not React) - Lightweight alternative to React
- **TypeScript** with strict configuration
- **Web Serial API** for serial communication
- **Vite** for development and building
- **Biome** for linting and formatting
- **Vitest** for testing
- **pnpm** as package manager

### Architecture
- `src/App.tsx` - Main Preact UI component
- `src/modbus.ts` - Modbus protocol implementation and client
- `src/serial.ts` - Web Serial API wrapper with event emitter
- `src/types.ts` - Shared TypeScript interfaces
- `src/style.css` - Application styles
- `test/modbus.test.ts` - Unit tests for Modbus functionality

## Development Setup

### Prerequisites
- Node.js and pnpm installed
- Chromium-based browser (Chrome 89+, Edge) for Web Serial API support

### Commands
```bash
pnpm install          # Install dependencies
pnpm dev              # Start Vite dev server (http://localhost:5173)
pnpm build            # Production build
pnpm preview          # Preview built assets
pnpm check            # Run linting and type checking
pnpm fix              # Auto-fix linting issues
pnpm test             # Run tests with vitest
```

## Code Style and Conventions

### Linting and Formatting
- Uses **Biome** (not ESLint/Prettier) for linting and formatting
- Configuration in `biome.json`
- **ALWAYS run `pnpm fix` before committing** to auto-format code
- Object properties and imports are automatically sorted
- 2-space indentation, single quotes, minimal semicolons

### TypeScript Patterns
- **Strict TypeScript** configuration enabled
- Use explicit types for interfaces (see `src/types.ts`)
- Import with `.ts` extensions: `import { ModbusClient } from './modbus.ts'`
- JSX uses Preact: `jsx: "react-jsx"` with `jsxImportSource: "preact"`

### React/Preact Patterns
- Use **Preact hooks**: `import { useState, useEffect } from 'preact/hooks'`
- Functional components only, no class components
- Event handlers use `e.currentTarget.value` not `e.target.value`
- Use proper TypeScript event types

### Event System
- Custom EventEmitter class in `src/serial.ts`
- Type-safe event definitions using generic types
- Pattern: `on(event, handler)`, `emit(event, ...args)`

## Modbus Protocol Specifics

### Function Codes Supported
- **Read**: FC01 (coils), FC02 (discrete inputs), FC03 (holding registers), FC04 (input registers)
- **Write**: FC05 (single coil), FC06 (single register), FC15 (multiple coils), FC16 (multiple registers)

### Protocol Implementation
- RTU mode with CRC16 validation
- ASCII mode (basic placeholder, needs LRC validation)
- Request/response correlation with timeout handling
- Automatic buffer management for serial data

### Testing Patterns
- Use `vitest` for testing
- Test CRC calculations, frame building, and parsing
- Mock responses using `handleResponse()` method
- Property-based testing with `fast-check` for edge cases

## File Organization

```
src/
├── App.tsx       # Main UI component (current active path)
├── main.tsx      # Preact entry point
├── modbus.ts     # Modbus protocol logic
├── serial.ts     # Web Serial API wrapper
├── types.ts      # TypeScript interfaces
└── style.css     # Application styles

test/
└── modbus.test.ts # Unit tests

Configuration files:
├── biome.json       # Linting and formatting
├── tsconfig.json    # TypeScript configuration
├── vite.config.ts   # Vite build configuration
└── package.json     # Dependencies and scripts
```

## Key Dependencies

- `preact` - UI framework (NOT React)
- `crc` - CRC calculation utilities
- `@types/w3c-web-serial` - Web Serial API types
- `@biomejs/biome` - Linting and formatting
- `vitest` - Testing framework
- `vite` - Build tool and dev server

## Common Patterns

### Serial Communication
```typescript
// Event-driven pattern
serialManager.on('connected', () => { /* handle */ })
serialManager.on('data', (data: Uint8Array) => { /* handle */ })
serialManager.on('disconnected', () => { /* handle */ })
```

### Modbus Operations
```typescript
// Reading data
const response = await modbusClient.read({
  slaveId: 1,
  functionCode: 3,
  startAddress: 0,
  quantity: 10
})

// Writing data
await modbusClient.write({
  slaveId: 1, 
  functionCode: 6,
  address: 0x0001,
  value: 0x1234
})
```

### State Management
- Use Preact hooks for local component state
- Event emitters for cross-component communication
- No external state management library needed

## Things to Avoid

1. **Don't use React** - This project uses Preact exclusively
2. **Don't install ESLint/Prettier** - Uses Biome instead
3. **Don't use class components** - Functional components only
4. **Don't ignore linting** - Always run `pnpm fix` before committing
5. **Don't modify Web Serial API calls directly** - Use the `SerialManager` wrapper
6. **Don't hardcode protocol values** - Use constants and proper type checking
7. **Don't break the event-driven architecture** - Maintain loose coupling between components

## Browser Compatibility

- **Required**: Chromium-based browsers with Web Serial API support
- **Not supported**: Firefox, Safari (no Web Serial API)
- The app checks for `'serial' in navigator` and shows appropriate errors

## Security Notes

- Web Serial API requires user gesture (button click) to select ports
- No automatic port selection for security reasons
- All serial communication is user-initiated

## Testing Guidelines

- Write tests for Modbus protocol logic
- Test CRC calculations and frame validation
- Use property-based testing for robustness
- Mock serial responses for integration tests
- Keep tests focused on pure functions when possible

## UI Guidelines

- Maintain clean, responsive design (desktop & mobile)
- Use semantic HTML and proper accessibility
- Keep the interface lightweight and functional
- Log all operations for debugging (TX/RX bytes, errors, status)
- Provide hex/decimal toggle for technical users

Remember: This is an industrial communication tool - prioritize reliability, clear error messages, and precise protocol implementation over fancy UI features.