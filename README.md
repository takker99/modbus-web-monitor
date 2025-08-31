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
- **Progressive Web App (PWA) support** with offline functionality and app installation

## PWA Features

This application is a Progressive Web App that provides:

- **Offline Capability**: After the first online load, the app works offline (UI only - serial communication requires hardware connection)
- **App Installation**: Install prompt appears on supported browsers (Chrome/Edge) for a native app-like experience  
- **Service Worker**: Automatic caching of core assets with cache invalidation on new deployments
- **App Manifest**: Proper metadata for installation and app behavior

### Installing as PWA

1. Open the app in a supported browser (Chrome 89+, Edge)
2. Look for the "Install" prompt in the address bar or browser menu
3. Click "Install" to add the app to your desktop/home screen
4. The app will behave like a native application with its own window

### Offline Usage

- Load the app once while online to cache all assets
- The UI remains fully functional offline
- Serial communication will only work when hardware is connected and browser has retained permissions
- After reconnecting online, any cached updates will be automatically applied

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
| PWA Support | `public/sw.js`, `public/manifest.json` | Service worker for offline caching, web app manifest for installation |
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

## Troubleshooting

### Port Disconnection Issues

**Problem:** Serial port becomes unexpectedly disconnected during operation.

**Common Causes:**
- **Cable/adapter unplugged** - Physical disconnection of USB-to-serial adapter
- **Browser permission revocation** - User or browser policy revoked serial port access
- **Device power loss** - Target Modbus device lost power or reset
- **Driver issues** - USB serial driver problems or conflicts

**Symptoms:**
- Orange warning banner appears: "Port Disconnected"
- Communication log shows "Serial port disconnected unexpectedly"
- Connection status changes to "Disconnected"

**Resolution:**
1. **Check physical connections** - Ensure USB cable and serial connections are secure
2. **Use the Reconnect button** - Click the "Reconnect" button in the disconnect banner
3. **Refresh browser permissions** - If reconnection fails, refresh the page and re-select the port
4. **Check device status** - Verify the target Modbus device is powered and responsive
5. **Try different USB port** - Switch to a different USB port if using a USB-to-serial adapter

### Connection Permission Issues

**Problem:** Browser denies access to serial ports.

**Symptoms:**
- "Port selection error" when clicking "Select Port"
- Browser doesn't show the port selection dialog

**Resolution:**
1. **Check browser compatibility** - Use Chrome 89+ or Edge 89+
2. **Enable secure context** - Ensure using HTTPS or localhost
3. **Check browser permissions** - Go to browser settings and check site permissions
4. **Clear browser data** - Clear site data and cookies, then try again

### General Communication Issues

**Problem:** No response from Modbus device or timeout errors.

**Symptoms:**
- "Request timed out" errors in communication log
- No response data received after sending commands

**Resolution:**
1. **Verify serial settings** - Check baud rate, data bits, parity, and stop bits match device
2. **Check slave ID** - Ensure the configured slave ID matches the device
3. **Test with simple reads** - Start with basic function codes (FC03) on known registers
4. **Check wiring** - Verify RS-485 A/B wiring polarity and termination resistors
5. **Monitor traffic** - Use the communication log to verify frames are being sent correctly

### Buffer Resynchronization and Noise Handling

**Problem:** Corrupted frames or electrical noise causing communication errors.

**Symptoms:**
- "CRC error" messages in communication log
- Intermittent communication failures
- Valid responses occasionally missed after noise events

**How it works:**
The application includes intelligent buffer resynchronization for RTU protocol:
- When a CRC error occurs, the system doesn't immediately clear the entire buffer
- Instead, it scans for the next plausible frame start (valid slave ID 1-247 + function code)
- If a candidate frame is found, the buffer advances to that position
- If no valid frame is detected, falls back to complete buffer reset
- This allows recovery of valid frames that follow corrupted data

**Supported frame detection:**
- Valid slave IDs: 1-247 (0x01-0xF7)
- Function codes: 1, 2, 3, 4, 5, 6, 15, 16
- Exception responses: 0x81-0x86, 0x8F, 0x90

**Resolution:**
1. **Check cable quality** - Use shielded cables for long runs or noisy environments
2. **Verify grounding** - Ensure proper grounding of RS-485 network
3. **Check termination** - Add 120Ω termination resistors at both ends of RS-485 bus
4. **Reduce noise sources** - Keep communication cables away from power lines and motors
5. **Lower baud rate** - Reduce communication speed if errors persist
6. **Use ASCII mode** - Consider ASCII protocol for extremely noisy environments (slower but more robust)

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
| `pnpm test` | Run all tests |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm test:watch` | Run tests in watch mode |

## Testing

This project has comprehensive test coverage for the Modbus protocol implementation with focus on reliability and edge case handling.

### Test Categories

- **Unit Tests** (`test/modbus.test.ts`) - Core protocol functionality, CRC/LRC calculations, frame building
- **Fuzzing Tests** (`test/modbus-fuzzing.test.ts`) - Property-based testing with random frame generation 
- **Timing Tests** (`test/modbus-timing.test.ts`) - Timeout handling, race conditions, overlapping requests
- **UI Tests** (`test/ui-parsing.test.ts`) - Input validation and parsing logic

### Coverage Requirements

- **Statements**: 90% (currently 93.64%)
- **Branches**: 85% (currently 87.96%) 
- **Lines**: 90% (currently 93.64%)
- **Functions**: 90% (currently 100%)

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage report
pnpm test:coverage

# Run tests in watch mode for development
pnpm test:watch

# Run specific test file
pnpm test test/modbus.test.ts
```

### Test Features

- **Property-based testing** with fast-check for robust frame validation
- **Fake timers** for deterministic timeout testing  
- **Frame fuzzing** with up to 200 random corrupted frames per test
- **Buffer boundary testing** with frame chunking scenarios
- **ASCII and RTU protocol coverage** including error paths
- **Race condition prevention** testing for concurrent requests

The test suite validates that the Modbus implementation handles malformed frames gracefully without crashes and properly manages request timeouts and overlapping requests.

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
