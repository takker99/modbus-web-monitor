//@vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { WritePanel } from "../src/components/WritePanel.tsx";

describe("WritePanel additional branches", () => {
  it("shows non-hex placeholder when hexDisplay=false for FC16", () => {
    render(
      <WritePanel
        hexDisplay={false}
        isConnected={true}
        onWrite={() => {}}
        setWriteConfig={() => {}}
        writeConfig={{
          address: 0,
          functionCode: 16,
          multiValues: "",
          quantity: 0,
          value: "",
        }}
      />,
    );
    const ta = screen.getByLabelText(/register values/i) as HTMLTextAreaElement;
    expect(ta.placeholder).toMatch(/1234,5678/); // non-hex variant
  });
  it("enables and triggers write for single coil when value present (pre-populated)", () => {
    const onWrite = vi.fn();
    const cfg = {
      address: 0,
      functionCode: 5 as 5 | 6 | 15 | 16,
      multiValues: "",
      quantity: 0,
      value: "1",
    };
    const { container } = render(
      <WritePanel
        hexDisplay={false}
        isConnected={true}
        onWrite={onWrite}
        setWriteConfig={() => {}}
        writeConfig={cfg}
      />,
    );
    const btn = container.querySelector(
      "button.btn.btn-warning",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onWrite).toHaveBeenCalled();
  });
});
