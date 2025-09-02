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

/** Modbus exception codes as defined in the specification. */
export type ExceptionCode = keyof typeof MODBUS_EXCEPTION_CODES;

/** Error for Modbus exception responses (function code | 0x80). */
export class ModbusExceptionError extends Error {
  name = "ModbusExceptionError" as const;

  constructor(
    public readonly code: number,
    options?: ErrorOptions,
  ) {
    const message = Object.hasOwn(MODBUS_EXCEPTION_CODES, code)
      ? MODBUS_EXCEPTION_CODES[code as ExceptionCode]
      : (`Unknown exception ${code}` as const);
    super(`${message} (code: ${code})`, options);
  }
}

/** Error for CRC validation failures. */
export class ModbusCRCError extends Error {
  name = "ModbusCRCError" as const;
  constructor(options?: ErrorOptions) {
    super("CRC error", options);
  }
}

/** Error for LRC validation failures. */
export class ModbusLRCError extends Error {
  name = "ModbusLRCError" as const;
  constructor(options?: ErrorOptions) {
    super("LRC error", options);
  }
}

/** Error for invalid frame format. */
export class ModbusFrameError extends Error {
  name = "ModbusFrameError" as const;
  constructor(message: string, options?: ErrorOptions) {
    super(`Frame error: ${message}`, options);
  }
}
