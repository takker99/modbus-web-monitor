# Modbus Web Monitor

Web-based Modbus RTU / ASCII inspector (monitor & tester) powered by the Web Serial API and Preact. It lets you connect to a serial Modbus device directly from Chrome (or any Chromium browser supporting Web Serial), send read/write requests, monitor periodic polling, and inspect raw frames.

> This tool was originally prototyped in Japanese; all UI and source comments have been translated to English.

## Features

- Runs 100% in the browser (no native installs) using Web Serial API
- Supports Modbus RTU and ASCII protocols with full framing validation
- Single read (FC 01/02/03/04) & write (FC 05/06) requests
- Multi-write operations (FC 15/16) with array input validation
- Periodic monitoring (polling) with adjustable interval in code (default 1000 ms)
- Hex or decimal display toggle for register values & addresses
- Real‑time communication log (TX/RX) with copy single / copy all and automatic trimming
- CRC16 (RTU) and LRC (ASCII) validation for frame integrity
- Simple buffering & response correlation with timeout handling
- Clean, responsive UI (desktop & mobile)

## Coverage

Code coverage reports are automatically generated and uploaded for each CI run. The project maintains comprehensive test coverage for core Modbus protocol functionality.

[![codecov](https://codecov.io/gh/takker99/modbus-web-monitor/branch/main/graph/badge.svg)](https://codecov.io/gh/takker99/modbus-web-monitor)

### Running Coverage Locally

```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html
```

Coverage reports include:
- Line, branch, and function coverage metrics
- Detailed per-file coverage analysis
- HTML report with uncovered line highlighting
- LCOV format for CI integration

## Roadmap Ideas (Not yet implemented)

- Saving / loading session profiles
- Export logs / captured values to CSV
- Custom polling interval in UI
- Advanced diagnostics functions (FC08+) and extended exception decoding

## Architecture Overview

| Layer | File(s) | Responsibility |
|-------|---------|---------------|
| UI (React-like) | `src/App.tsx` | Preact component implementation of the full UI (current active path) |
| Legacy DOM UI (non-Preact) | `src/ui.ts` + `src/main.ts` | Earlier vanilla DOM event driven UI (still present; not used when using `main.tsx`) |
| Modbus protocol | `src/modbus.ts` | Building requests, parsing RTU/ASCII responses, CRC/LRC validation, monitoring loop |
| Serial abstraction | `src/serial.ts` | Web Serial API wrapper + event emitter |
| Types | `src/types.ts` | Shared TypeScript interfaces |

The Preact entry point is `index.html` -> `src/main.tsx` -> `App`.

## Function Code Type Safety

The codebase uses TypeScript's strict typing for Modbus function codes to prevent runtime errors from unsupported codes:

```typescript
// Type-safe function code definitions
type ReadFunctionCode = 1 | 2 | 3 | 4       // Read operations only
type WriteSingleFunctionCode = 5 | 6         // Single write operations
type WriteMultiFunctionCode = 15 | 16        // Multi-write operations
type WriteFunctionCode = WriteSingleFunctionCode | WriteMultiFunctionCode

// Usage in configuration interfaces
interface ModbusReadConfig {
  functionCode: ReadFunctionCode  // Only 1|2|3|4 allowed
  // ... other properties
}

interface ModbusWriteConfig {
  functionCode: WriteFunctionCode  // Only 5|6|15|16 allowed  
  // ... other properties
}
```

**Benefits:**
- **Compile-time validation**: TypeScript will reject invalid function codes (e.g., `functionCode: 7`)
- **Enhanced IDE support**: Auto-completion shows only valid function codes
- **Documentation**: Types serve as inline documentation of supported operations
- **Refactoring safety**: Changes to supported function codes are automatically reflected

Example:
```typescript
// ✅ Valid - compiles successfully
const readConfig: ModbusReadConfig = { functionCode: 3, ... }
const writeConfig: ModbusWriteConfig = { functionCode: 6, ... }

// ❌ Invalid - TypeScript compilation error
const invalidConfig: ModbusReadConfig = { functionCode: 7, ... }  // Error!
```

## Prerequisites

- Chromium-based browser with Web Serial API (Chrome 89+, Edge, etc.). Firefox & Safari currently lack required API.
- A Modbus slave device connected via a serial adapter recognizable by the OS (USB/RS485, etc.).

## Getting Started (Development)

Install dependencies (pnpm recommended):

```bash
pnpm install
pnpm dev
```

Then open the printed local URL (default `http://localhost:5173`).

For a production build:

```bash
pnpm build
pnpm preview
```

## Using the App

1. Open the app in a supported browser.
2. Click "Select Port" and choose your serial interface (RS-485 adapter, etc.).
3. Adjust serial parameters (baud rate, data bits, parity, stop bits) and Modbus settings (Slave ID, protocol) if needed.
4. Press "Connect".
5. For a single read: choose a function code (e.g. Holding Registers = FC03), start address, and quantity; click "Read".
6. To start periodic polling: click "Start Monitor" (click again to stop). Default interval is 1000 ms; adjust in `App.tsx` or `modbus.ts` if needed.
7. To write: 
   - **Single writes (FC05/06)**: Select function (05 coil / 06 single register), address, and value (prefix with `0x` for hex) then click "Write".
   - **Multi-coil writes (FC15)**: Select "15 - Write Multiple Coils", enter start address, and provide comma or space-separated coil values (0 or 1). Max 1968 coils.
   - **Multi-register writes (FC16)**: Select "16 - Write Multiple Registers", enter start address, and provide comma/space/line-separated register values (0-65535). Max 123 registers.
8. Toggle "Hex Display" to view values / addresses in hexadecimal.
9. Use "Clear Logs" or "Copy All Logs" for log management; each log line also has an individual copy button.

### Log Types

- Info: general status messages
- Sent: outbound Modbus frame bytes
- Received: inbound Modbus frame bytes
- Error: serial / protocol / timeout issues

## Screenshots

### FC01 - Read Coils Interface

![FC01 Read Coils Interface](https://github.com/user-attachments/assets/fa75d17b-5d8e-486c-a885-b341abac9a11)

The FC01 interface allows you to read multiple coils from the Modbus device. Enter the start address and quantity of coils to read. The response will show each coil as a bit value (0 or 1).

### FC02 - Read Discrete Inputs Interface

![FC02 Read Discrete Inputs Interface](https://github.com/user-attachments/assets/d37c245c-6a69-4fff-878d-518db38d2250)

The FC02 interface allows you to read discrete inputs from the Modbus device. Similar to coils, but typically read-only status inputs. Enter the start address and quantity of discrete inputs to read.

### FC03 - Read Holding Registers Interface

![FC03 Read Holding Registers Interface](https://github.com/user-attachments/assets/83161f44-ccaa-4edb-a6dd-6c37197c81c2)

The FC03 interface allows you to read holding registers from the Modbus device. These are typically read/write registers used for configuration and data storage. Enter the start address and quantity of registers to read.

### FC04 - Read Input Registers Interface

![FC04 Read Input Registers Interface](https://github.com/user-attachments/assets/2778c198-1487-4dbf-aa73-27651767e799)

The FC04 interface allows you to read input registers from the Modbus device. These are typically read-only registers containing measurement data or status information. Enter the start address and quantity of registers to read.

### FC05 - Write Single Coil Interface

![FC05 Write Single Coil Interface](https://github.com/user-attachments/assets/7a0d0cee-5214-4d74-83d4-153bcfdef07d)

The FC05 interface allows you to write a single coil value. Enter the coil address and value (0 for OFF, 1 for ON). This is used for controlling individual digital outputs or control points.

### FC06 - Write Single Register Interface

![FC06 Write Single Register Interface](https://github.com/user-attachments/assets/353fb842-a6e1-4c34-95ee-1565bbb06e82)

The FC06 interface allows you to write a single register value. Enter the register address and value (0-65535). Supports hexadecimal values when hex display mode is enabled (prefix with 0x).

### FC15 - Write Multiple Coils Interface

![FC15 Multi-Coil Write Interface](https://github.com/user-attachments/assets/09eb3fe7-b5e3-4a14-b88d-ad65e82b701b)

The FC15 interface allows you to write multiple coils at once. Enter coil values as comma or space-separated bits (0 or 1), with a maximum of 1968 coils.

### FC16 - Write Multiple Registers Interface  

![FC16 Multi-Register Write Interface](https://github.com/user-attachments/assets/812d1fb4-328f-4f5e-b04d-e2f05985c36c)

The FC16 interface allows you to write multiple registers at once. Enter register values as comma, space, or line-separated numbers (0-65535), with support for hexadecimal values when hex display mode is enabled. Maximum of 123 registers.

## Modbus Frames (RTU)

Read request (example FC03):

```
| Slave | Func | Start Hi | Start Lo | Qty Hi | Qty Lo | CRC Lo | CRC Hi |
```

Single register write (FC06):

```
| Slave | 06 | Addr Hi | Addr Lo | Value Hi | Value Lo | CRC Lo | CRC Hi |
```

CRC16 polynomial 0xA001 (LSB first) is used. Exception responses are decoded with a basic Japanese->English translated map.

## Modbus Frames (ASCII)

ASCII frames are encoded in hexadecimal text format with start/end delimiters:

```
:AABBCCDDDD...EELR\r\n
```

Where:
- `:` = Start character (0x3A)
- `AA`, `BB`, etc. = Hexadecimal pairs representing data bytes (uppercase)
- `LR` = LRC (Longitudinal Redundancy Check) as hex pair
- `\r\n` = Termination (CR+LF, 0x0D 0x0A)

**LRC Calculation:** `LRC = (256 - (sum of all data bytes % 256)) % 256`

Example read request (FC03):
```
:01030000000AFB\r\n
```
- Slave: 01, Function: 03, Start: 0000, Quantity: 000A, LRC: FB

The ASCII implementation handles:
- Proper frame detection (`:` start, `\r\n` end)
- Hex decoding with validation
- LRC calculation and verification  
- Buffer management for partial/concatenated frames
- Error handling identical to RTU (LRC mismatch triggers error event)

## Error / Exception Handling

- Pending request queue: only one outstanding at a time; attempts while busy reject.
- 3 second timeout clears pending state.
- On Modbus exception (function | 0x80), the code is mapped and surfaced in logs.
- CRC mismatch triggers an error and buffer reset for that frame.

## Security Notes

The Web Serial API requires a user gesture to open a port; the page cannot access serial devices silently. All communication happens locally; no data leaves the browser unless you manually copy it.

## Supported Function Codes

This application provides full support for standard Modbus read and write operations with proper type differentiation:

### Read Operations
- **FC01 - Read Coils**: Digital outputs/coils status (read/write bits)
- **FC02 - Read Discrete Inputs**: Digital inputs status (read-only bits)  
- **FC03 - Read Holding Registers**: Analog/data registers (read/write registers)
- **FC04 - Read Input Registers**: Input/measurement registers (read-only registers)

### Write Operations
- **FC05 - Write Single Coil**: Write single digital output
- **FC06 - Write Single Register**: Write single analog/data register  
- **FC15 - Write Multiple Coils**: Write multiple digital outputs (up to 1968 coils)
- **FC16 - Write Multiple Registers**: Write multiple registers (up to 123 registers)

### Enhanced Features
- **Function code labeling**: UI displays specific types (Coils, Discrete Inputs, etc.) in data tables and logs
- **Unified parsing**: Dedicated utilities for bit-based (FC01/02) and register-based (FC03/04) responses
- **Protocol support**: Full RTU and ASCII mode compatibility with proper CRC16/LRC validation
- **Extensible design**: Structured for easy addition of future function codes

## Limitations

- Exception responses are decoded with basic error code translation
- Advanced diagnostics functions (FC08+) are not yet implemented
- File transfer and program control functions are not supported

## Project Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Preview built assets |
| `pnpm check` | Lint & TS (biome + tsgo) |
| `pnpm fix` | Auto-fix issues |
| `pnpm test` | Run tests |
| `pnpm test:coverage` | Run tests with coverage report |

The project includes a comprehensive CI pipeline that:
- Tests across Node.js versions 18, 20, and 22
- Uses pnpm dependency caching for faster builds
- Generates and uploads coverage reports
- Automatically uploads coverage data to Codecov (if configured)

## Contributing

Issues & PRs welcome. Please keep the UI clean and lightweight. For significant protocol enhancements (multi-part frames, advanced diagnostics), consider adding tests and clear logs.

## License

MIT © 2025 takker99

## Acknowledgements

- Web Serial API team & MDN docs
- Preact for a minimal footprint
- Modbus protocol community references

---
Enjoy inspecting your Modbus devices directly from the browser.
# Test CI fix
