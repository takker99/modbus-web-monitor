// Utility functions extracted from App.tsx to reduce component size
// and enable focused unit testing. All functions are pure.

export interface ParseOptions {
  hex?: boolean; // interpret numeric strings as hex (allow optional 0x prefix)
}

/**
 * Parse coil (bit) values from a user provided string.
 * Accepts comma, space or newline separated tokens containing 0 or 1.
 * Throws on invalid token or limit overflow.
 */
export function parseCoilValues(input: string): number[] {
  const values = input
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter((v) => v !== "")
    .map((v) => {
      const num = Number.parseInt(v, 10);
      if (num !== 0 && num !== 1) {
        throw new Error(`Invalid coil value: ${v}. Must be 0 or 1.`);
      }
      return num;
    });

  if (values.length === 0) {
    throw new Error("No coil values provided");
  }
  if (values.length > 1968) {
    throw new Error(`Too many coils: ${values.length}. Maximum is 1968.`);
  }

  return values;
}

/**
 * Parse register (16-bit) values. Accepts comma, space or newline separated tokens.
 * When hex option is true, tokens are parsed as hexadecimal (0x prefix optional).
 */
export function parseRegisterValues(
  input: string,
  opts: ParseOptions,
): number[] {
  const { hex = false } = opts;
  const values = input
    .split(/[,\n\s]+/)
    .map((v) => v.trim())
    .filter((v) => v !== "")
    .map((v) => {
      let num: number;
      if (hex) {
        // Allow with or without 0x prefix
        const normalized =
          v.startsWith("0x") || v.startsWith("0X") ? v : `0x${v}`;
        num = Number.parseInt(normalized, 16);
      } else {
        num = Number.parseInt(v, 10);
      }
      if (Number.isNaN(num) || num < 0 || num > 65535) {
        throw new Error(`Invalid register value: ${v}. Must be 0-65535.`);
      }
      return num;
    });

  if (values.length === 0) {
    throw new Error("No register values provided");
  }
  if (values.length > 123) {
    throw new Error(`Too many registers: ${values.length}. Maximum is 123.`);
  }

  return values;
}

export function formatValue(value: number, opts: { hex?: boolean }): string {
  return opts.hex
    ? `0x${value.toString(16).toUpperCase().padStart(4, "0")}`
    : value.toString();
}

export function formatAddress(
  address: number,
  opts: { hex?: boolean },
): string {
  return opts.hex
    ? `0x${address.toString(16).toUpperCase().padStart(4, "0")}`
    : address.toString();
}

export type LogEntry = { timestamp: string; type: string; message: string };
