//@vitest-environment jsdom

import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { SerialManagerTransport } from "../src/components/SerialManagerTransport.ts";
import { WritePanel } from "../src/components/WritePanel.tsx";

// Focus: cover WritePanel disabled logic branches & SerialManagerTransport error listener abort branch

describe("WritePanel edge cases", () => {
  const base = {
    address: 0,
    functionCode: 5 as 5 | 6 | 15 | 16,
    multiValues: "",
    quantity: 0,
    value: "",
  };
  it("disables write when disconnected (single write)", () => {
    render(
      <WritePanel
        hexDisplay={false}
        isConnected={false}
        onWrite={() => {}}
        setWriteConfig={() => {}}
        writeConfig={base}
      />,
    );
    const btn = screen.getByRole("button", { name: /write/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
  it("disables write when multi (15) and values empty", () => {
    render(
      <WritePanel
        hexDisplay={false}
        isConnected={true}
        onWrite={() => {}}
        setWriteConfig={() => {}}
        writeConfig={{ ...base, functionCode: 15 }}
      />,
    );
    const btn = screen
      .getAllByRole("button", { name: /write/i })
      .pop() as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
  it("disables write when multi (16) and values empty", () => {
    render(
      <WritePanel
        hexDisplay={true}
        isConnected={true}
        onWrite={() => {}}
        setWriteConfig={() => {}}
        writeConfig={{ ...base, functionCode: 16 }}
      />,
    );
    const btn = screen
      .getAllByRole("button", { name: /write/i })
      .pop() as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

// Minimal SerialManager stub capturing off() removal on abort (already covered; add extra call path)
type Listener = (arg: unknown) => void;
class SM {
  connected = true;
  listeners: Record<string, Listener[]> = {};
  on(ev: string, fn: Listener) {
    if (!this.listeners[ev]) this.listeners[ev] = [];
    this.listeners[ev].push(fn);
  }
  off(ev: string, fn: Listener) {
    this.listeners[ev] = (this.listeners[ev] || []).filter((f) => f !== fn);
  }
  async disconnect() {}
  async send() {
    return;
  }
  emit(ev: string, arg: unknown) {
    for (const f of this.listeners[ev] || []) f(arg);
  }
}

describe("SerialManagerTransport abort error listener removal", () => {
  it("removes error listener after abort signal", async () => {
    const sm = new SM();
    const transport = new SerialManagerTransport(
      sm as unknown as never,
      () => {},
    );
    const ac = new AbortController();
    const calls: Error[] = [];
    transport.addEventListener(
      "error",
      (ev: CustomEvent<Error>) => calls.push(ev.detail),
      { signal: ac.signal },
    );
    // cause abort
    ac.abort();
    // emit after abort - should not push
    sm.emit("error", new Error("later"));
    expect(calls.length).toBe(0);
  });
});
