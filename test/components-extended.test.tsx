//@vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ConnectionSettingsPanel } from "../src/frontend/components/ConnectionSettingsPanel.tsx";
import { ReadPanel } from "../src/frontend/components/ReadPanel.tsx";
import { WritePanel } from "../src/frontend/components/WritePanel.tsx";

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
        readConfig={{ address: 0, functionCode: 3, quantity: 5 }}
        setReadConfig={
          vi.fn() as unknown as (
            u: (p: {
              functionCode: 1 | 2 | 3 | 4;
              quantity: number;
              address: number;
            }) => {
              functionCode: 1 | 2 | 3 | 4;
              quantity: number;
              address: number;
            },
          ) => void
        }
      />,
    );
    expect(screen.getByRole("button", { name: /stop monitor/i })).toBeTruthy();
  });
});
