# Copilot Instructions: Modbus Web Monitor

Concise, project-specific guide (≈35–50 lines). Focus on how code actually works today.

## Architecture / Files
- Browser-only (Web Serial API) + Preact + strict TypeScript, built with Vite.
- Pattern: thin stateful classes + pure functions for protocol logic.
  - `modbus.ts`: pending request gate (single in-flight), 3s timeout, polling loop, RTU buffer & resync, ASCII buffering, emits request/response/error.
  - `frameBuilder.ts`: pure request frame builders (RTU & ASCII). Add new function codes here.
  - `frameParser.ts`: CRC/LRC helpers, frame length logic, resync (`findFrameResyncPosition`), bit/register extractors.
  - `functionCodes.ts`: type-safe FC sets, labels, predicate helpers (`isReadFunctionCode`, `isWriteFunctionCode`).
  - `crc.ts` / `lrc.ts`: checksum pure functions.
  - `serial.ts`: `SerialManager` wraps Web Serial + generic `EventEmitter`.
  - `App.tsx`: single UI; keeps last 100 logs & responses; persists polling interval in `localStorage('modbus-polling-interval')`.

## Critical Behaviors
- Concurrency guard: second read/write while `#pendingRequest` → `ModbusBusyError`.
- Frame acceptance: slaveId + functionCode (or exception `fc|0x80`) must match pending request.
- RTU resync: on CRC failure scan with `findFrameResyncPosition`; if none, drop buffer.
- ASCII: accumulate `:...\r\n`; invalid/LRC mismatch → discard whole frame; buffer cleared for desync.
- Polling: `startMonitoring` sequentially awaits `read`; errors emit but loop continues.
- Multi-write limits: coils ≤1968, registers ≤123 (validated in UI parsing helpers).

## Event Flow
`SerialManager` data → `ModbusClient.handleResponse()` → parse → `response` event → UI state update. Requests: `ModbusClient.emit('request')` → UI sends via `serialManager.send()`.

## Testing (Vitest + fast-check)
- Location: `test/*.test.ts` (CRC/LRC, builder, parser, resync, timing, ASCII edges, fuzzing, UI parse).
- Add round‑trip (build→parse) tests for new function codes.
- Commands: `pnpm test`, coverage `pnpm test:coverage`, watch `pnpm test:watch`, single file `pnpm test test/frameBuilder.test.ts`.

## Scripts
```bash
pnpm dev   # Dev server
pnpm fix   # Biome + tsgo (run & ensure clean before committing large refactors)
pnpm check # Lint + type
pnpm build # Production build
```
Note: always use explicit `.ts` extensions in imports.

## Usage Examples
```ts
await modbusClient.read({ slaveId:1, functionCode:3, startAddress:0, quantity:10 });
await modbusClient.write({ slaveId:1, functionCode:16, address:0x0100, value:[0x1234,0x5678] });
```

## Extension Checklist (New Function Code)
1. Add type + label + predicates in `functionCodes.ts`.
2. Add build branch (RTU & ASCII) in `frameBuilder.ts`.
3. Add parse length/data extraction in `frameParser.ts`.
4. UI auto-label works via `functionCodeLabel`; only tweak `App.tsx` if special formatting needed.
5. Add tests (normal + exception + CRC/LRC failure + fuzz case).

## Commit & Workflow Rules
- Conventional Commits (English) e.g. `feat: add FC17 support` / `fix: correct CRC edge handling`.
- Run `pnpm fix` (must be clean) before committing.
- Split changes into logical commits (protocol refactor, UI tweak, test add) — avoid one giant commit.

## Do NOT
- Use npm / create or commit `package-lock.json` (pnpm only; keep `pnpm-lock.yaml`).
- Add React / class components / Redux.
- Bypass `SerialManager` to touch `SerialPort` directly.
- Launch parallel reads/writes while pending.
- Omit `.ts` extensions or add ESLint/Prettier configs.
- Hardcode magic numbers (use existing constants/types for FC, limits).

## Security / Browser Assumptions
- Web Serial requires explicit user gesture; never auto-select a port.
- Firefox/Safari unsupported; UI already warns — no extra fallbacks.

Request clarifications or missing scenarios and this guide can be amended.