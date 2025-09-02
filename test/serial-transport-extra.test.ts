import { describe, expect, it } from "vitest";
import { SerialTransport } from "../src/transport/serial-transport.ts";
import type { SerialTransportConfig } from "../src/transport/transport.ts";
import { MockSerialPort } from "./mock-serial-port.ts";

describe("SerialTransport extra coverage", () => {
  const cfg: SerialTransportConfig = {
    baudRate: 9600,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    type: "serial",
  };

  // (disconnect path covered indirectly in other tests; skip here to avoid hanging reader loop)

  it("reader loop error dispatch", async () => {
    const port = new MockSerialPort();
    const t = new SerialTransport(cfg, port);
    await t.connect();
    let err: Error | undefined;
    t.addEventListener("error", (e) => {
      err = (e as CustomEvent<Error>).detail;
    });
    // Force underlying reader to throw once
    (
      port as unknown as { mockReader?: { simulateError(e: Error): void } }
    ).mockReader?.simulateError(new Error("read boom"));
    // Give the async loop time
    await new Promise((r) => setTimeout(r, 25));
    expect(err?.message).toMatch(/read boom|Data receive error/);
  });
});
