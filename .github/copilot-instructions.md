## Copilot Instructions: Modbus Web Monitor

Concise, project-specific guide (≈40 lines). Reflects current pure function + transport architecture.

### Architecture & Key Files
- Browser-only Preact + strict TS (Vite). No server code.
- Pure function Modbus API split by protocol: `src/rtu.ts`, `src/ascii.ts` (build frames, send via transport, await single response, parse, return `Result`).
- Framing / parsing primitives: `frameBuilder.ts`, `frameParser.ts`, `crc.ts`, `lrc.ts`, `functionCodes.ts`, `errors.ts`.
- Transport abstraction (`src/transport/*`): `SerialTransport`, `MockTransport`, `TcpTransport` (placeholder). Unified event interface (`open`, `close`, `statechange`, `message`, `error`).
- UI entry: `src/frontend/main.tsx` -> `App.tsx` (single component; manages hex toggle, logs (trim to 100), monitoring loop, localStorage for polling interval).
- Legacy class client removed: do NOT reintroduce stateful request gate; each call is independent; caller controls concurrency.

### Critical Behaviors / Constraints
- One logical Modbus operation per function; no hidden retries; caller may wrap with polling or timeout (AbortSignal supported in every op via last options arg).
- Result pattern: uses `option-t/plain_result` (`createOk/createErr`, `isOk/isErr`) instead of throwing; only truly unexpected internal bugs should throw.
- Frame limits: multi-coil write ≤1968 bits; multi-register write ≤123 (validate before building).
- RTU resync: on CRC failure parser scans for plausible next frame start; ASCII discards entire `:...\r\n` on LRC or format error.
- Exception frames (fc | 0x80) converted to `ModbusExceptionError` with original code & exception byte.

### Typical Flow (Read Holding Registers RTU)
1. Caller invokes `readHoldingRegisters(transport, slaveId, start, qty, { signal })`.
2. Function builds request via `frameBuilder` → writes raw bytes with `transport.postMessage`.
3. Awaits first matching response frame (slave + fc or exception) from `message` events (internal mini listener) then parses via `frameParser`.
4. Returns `Ok({ data, raw })` or `Err(error)`.

### Adding a Function Code
1. Extend types/predicates & label in `functionCodes.ts`.
2. Add build logic in `frameBuilder.ts` (RTU & ASCII branches) + parse length & data extraction in `frameParser.ts`.
3. Add high-level helper in `rtu.ts` / `ascii.ts` mirroring existing naming (e.g. `readX`, `writeY`).
4. Tests: round‑trip (build→parse), exception path, CRC/LRC failure, fuzz (see existing patterns), and UI parse if formatting differs.

### Adding a Transport
1. Implement class extending base interface in `src/transport` (see `serial-transport.ts`, `mock-transport.ts`).
2. Emit required events; buffer assembly responsibility stays inside the transport (only raw bytes emitted). No protocol parsing here.
3. Register in factory (`createTransport`) & add tests (connect lifecycle, message pass-through, error propagation).

### Testing (Vitest + fast-check)
- All tests under `test/`. Includes fuzzing (`modbus-fuzzing.test.ts`), resync, ASCII/RTU parity, UI parse, transport behaviors.
- Commands: `pnpm test`, `pnpm test:coverage`, `pnpm test:watch`, single file `pnpm test test/frameBuilder.test.ts`.

### Scripts / Tooling
`pnpm dev` (Vite) | `pnpm build` | `pnpm preview` | `pnpm check` (lint+type) | `pnpm fix` (auto-fix) . Always use explicit `.ts` extensions; pnpm only (keep `pnpm-lock.yaml`).

### Do / Don't
Do: keep functions pure (no hidden mutable state), return `Result`, add exhaustive tests with edge & exception cases, respect frame size limits, add JSDoc, reuse existing helpers instead of duplicating logic.
Don't: add class client wrappers, mutate shared module state, bypass transport events, throw for normal protocol errors, introduce React/Redux, commit `package-lock.json`.

### Security & Browser Assumptions
Web Serial requires user gesture; never auto-open. Firefox/Safari unsupported (no polyfills). Data stays local.

### Commit Conventions
Conventional Commits (English). Separate protocol, transport, UI, and test changes. Ensure `pnpm fix` & `pnpm check` pass before pushing.

Questions or edge cases not covered? Ask for clarification before introducing new architectural patterns.