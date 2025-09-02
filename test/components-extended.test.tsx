//@vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ConnectionSettingsPanel } from "../src/components/ConnectionSettingsPanel.tsx";
import { ReadPanel } from "../src/components/ReadPanel.tsx";
import { SerialManagerTransport } from "../src/components/SerialManagerTransport.ts";
import { WritePanel } from "../src/components/WritePanel.tsx";

// Minimal SerialManager stub for adapter tests
type Listener<T> = (arg: T) => void;
class StubSerialManager {
  listeners: Record<string, Array<Listener<unknown>>> = {};
  connected = true;
  async disconnect() {
    this.connected = false;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(_d: Uint8Array) {
    return Promise.resolve();
  }
  on<T>(ev: string, fn: Listener<T>) {
    if (!this.listeners[ev]) this.listeners[ev] = [];
    this.listeners[ev].push(fn as Listener<unknown>);
  }
  off<T>(ev: string, fn: Listener<T>) {
    this.listeners[ev] = (this.listeners[ev] || []).filter((f) => f !== fn);
  }
  emit<T>(ev: string, arg: T) {
    for (const f of this.listeners[ev] || []) (f as Listener<T>)(arg);
  }
}

class FailingSendSerialManager extends StubSerialManager {
  async send(_d: Uint8Array): Promise<void> {
    return new Promise((_, reject) =>
      queueMicrotask(() => {
        const err = new Error("fail send");
        this.emit("error", err);
        reject(err);
      }),
    );
  }
}

describe("WritePanel extended scenarios", () => {
  it("enables write for multi coil (15) when values entered (simplified without state updates)", () => {
    // Direct render with functionCode 15
    render(
      <WritePanel
        hexDisplay={false}
        isConnected={true}
        onWrite={() => {}}
        setWriteConfig={() => {}}
        writeConfig={{
          address: 0,
          functionCode: 15,
          multiValues: "1,0,1",
          quantity: 0,
          value: "",
        }}
      />,
    );
    const btn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "Write") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
  it("enables write for multi register (16) when values entered (hex placeholder path)", () => {
    render(
      <WritePanel
        hexDisplay={true}
        isConnected={true}
        onWrite={() => {}}
        setWriteConfig={() => {}}
        writeConfig={{
          address: 0,
          functionCode: 16,
          multiValues: "0x1234,0x5678",
          quantity: 0,
          value: "",
        }}
      />,
    );
    const btn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "Write") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

describe("ConnectionSettingsPanel interactions", () => {
  it("fires change handlers", () => {
    const setSerial = vi.fn();
    const onProt = vi.fn();
    const onSlave = vi.fn();
    render(
      <ConnectionSettingsPanel
        isConnected={false}
        onConnect={() => {}}
        onDisconnect={() => {}}
        onProtocolChange={onProt}
        onSelectPort={() => {}}
        onSlaveIdChange={onSlave}
        portSelected={false}
        protocol="rtu"
        serialConfig={{
          baudRate: 9600,
          dataBits: 8,
          parity: "none",
          stopBits: 1,
        }}
        setSerialConfig={setSerial}
        slaveId={1}
      />,
    );
    fireEvent.change(screen.getByLabelText(/baud rate/i), {
      target: { value: "19200" },
    });
    fireEvent.change(screen.getByLabelText(/parity/i), {
      target: { value: "even" },
    });
    fireEvent.change(screen.getByLabelText(/slave id/i), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(/protocol/i), {
      target: { value: "ascii" },
    });
    expect(setSerial).toHaveBeenCalled();
    expect(onProt).toHaveBeenCalledWith("ascii");
    expect(onSlave).toHaveBeenCalledWith(2);
  });
});

describe("ReadPanel extra states", () => {
  it("shows Stop Monitor when monitoring", () => {
    render(
      <ReadPanel
        isConnected={true}
        isMonitoring={true}
        onMonitorToggle={() => {}}
        onPollingIntervalChange={() => {}}
        onRead={() => {}}
        pollingInterval={500}
        readConfig={{ functionCode: 3, quantity: 5, startAddress: 0 }}
        setReadConfig={
          vi.fn() as unknown as (
            u: (p: {
              functionCode: 1 | 2 | 3 | 4;
              quantity: number;
              startAddress: number;
            }) => {
              functionCode: 1 | 2 | 3 | 4;
              quantity: number;
              startAddress: number;
            },
          ) => void
        }
      />,
    );
    expect(screen.getByRole("button", { name: /stop monitor/i })).toBeTruthy();
  });
});

describe("SerialManagerTransport event paths", () => {
  it("dispatches message event and removes listener on abort", () => {
    const sm = new StubSerialManager();
    const logs: string[] = [];
    const transport = new SerialManagerTransport(
      sm as unknown as never,
      (t, m) => logs.push(`${t}:${m}`),
    );
    const ac = new AbortController();
    const messages: Uint8Array[] = [];
    transport.addEventListener(
      "message",
      (ev: CustomEvent<Uint8Array>) => messages.push(ev.detail),
      { signal: ac.signal },
    );
    sm.emit("data", new Uint8Array([1, 2, 3]));
    expect(messages.length).toBe(1);
    ac.abort();
    sm.emit("data", new Uint8Array([4]));
    expect(messages.length).toBe(1); // no new after abort
  });
  it("dispatches error event when send rejects", async () => {
    const sm = new FailingSendSerialManager();
    const errors: Error[] = [];
    const transport = new SerialManagerTransport(
      sm as unknown as never,
      () => {},
    );
    transport.addEventListener("error", (ev: CustomEvent<Error>) =>
      errors.push(ev.detail),
    );
    transport.postMessage(new Uint8Array([0x01]));
    // flush queued microtasks/timeouts
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });
});
