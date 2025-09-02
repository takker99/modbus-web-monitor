//@vitest-environment jsdom

import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { WritePanel } from "../src/frontend/components/WritePanel.tsx";

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
