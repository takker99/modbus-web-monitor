/**
 * Unified error types and exception code mapping for Modbus operations.
 */

/** Modbus exception codes as defined in the specification. */
export const MODBUS_EXCEPTION_CODES = {
  1: "Illegal function",
  2: "Illegal data address (address does not exist)",
  3: "Illegal data value",
  4: "Slave device failure",
  5: "Acknowledge",
  6: "Slave device busy",
  8: "Memory parity error",
  10: "Gateway path unavailable",
  11: "Gateway target device failed to respond",
} as const;

/** Base error class for Modbus-related errors. */
export class ModbusError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "ModbusError";
  }
}

/** Error for Modbus exception responses (function code | 0x80). */
export class ModbusExceptionError extends ModbusError {
  constructor(
    public readonly exceptionCode: keyof typeof MODBUS_EXCEPTION_CODES,
  ) {
    const message =
      MODBUS_EXCEPTION_CODES[exceptionCode] ||
      `Unknown exception ${exceptionCode}`;
    super(`${message} (code: ${exceptionCode})`, exceptionCode);
    this.name = "ModbusExceptionError";
  }
}

/** Error for CRC validation failures. */
export class ModbusCRCError extends ModbusError {
  constructor() {
    super("CRC error");
    this.name = "ModbusCRCError";
  }
}

/** Error for LRC validation failures. */
export class ModbusLRCError extends ModbusError {
  constructor() {
    super("LRC error");
    this.name = "ModbusLRCError";
  }
}

/** Error for invalid frame format. */
export class ModbusFrameError extends ModbusError {
  constructor(message: string) {
    super(`Frame error: ${message}`);
    this.name = "ModbusFrameError";
  }
}

/** Error for concurrent request attempts. */
export class ModbusBusyError extends ModbusError {
  constructor() {
    super("Another request is in progress");
    this.name = "ModbusBusyError";
  }
}
