//@vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ConnectionSettingsPanel } from "../src/frontend/components/ConnectionSettingsPanel.tsx";
import { DataDisplayPanel } from "../src/frontend/components/DataDisplayPanel.tsx";
import { PortDisconnectedBanner } from "../src/frontend/components/PortDisconnectedBanner.tsx";
import { ReadPanel } from "../src/frontend/components/ReadPanel.tsx";
import { WritePanel } from "../src/frontend/components/WritePanel.tsx";
import type { ModbusResponse } from "../src/modbus.ts";

function makeResp(fc: number, data: number[]): ModbusResponse {
  return {
    data,
    functionCode: fc,
    slaveId: 1,
    timestamp: new Date(),
  };
}

describe("PortDisconnectedBanner", () => {
  it("calls onReconnect", () => {
    const onRec = vi.fn();
    render(<PortDisconnectedBanner onReconnect={onRec} />);
    fireEvent.click(screen.getByRole("button", { name: /reconnect/i }));
    expect(onRec).toHaveBeenCalled();
  });
});

describe("ConnectionSettingsPanel", () => {
  it("disables inputs when connected", () => {
    const setSerial = vi.fn();
    const onProt = vi.fn();
    const onSlave = vi.fn();
    const onSelect = vi.fn();
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    render(
      <ConnectionSettingsPanel
        isConnected={true}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onProtocolChange={onProt}
        onSelectPort={onSelect}
        onSlaveIdChange={onSlave}
        portSelected={true}
        protocol="rtu"
        serialConfig={{
          baudRate: 38400,
          dataBits: 8,
          parity: "none",
          stopBits: 1,
        }}
        setSerialConfig={setSerial}
        slaveId={1}
      />,
    );
    expect(
      (screen.getByLabelText(/baud rate/i) as HTMLSelectElement).disabled,
    ).toBe(true);
    const connectBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "Connect") as
      | HTMLButtonElement
      | undefined;
    if (!connectBtn) throw new Error("Connect button not found");
    expect(connectBtn.disabled).toBe(true);
  });
});

describe("ReadPanel", () => {
  it("invokes read and monitor handlers", () => {
    const setRead = vi.fn();
    const onPI = vi.fn();
    const onRead = vi.fn();
    const onMon = vi.fn();
    render(
      <ReadPanel
        isConnected={true}
        isMonitoring={false}
        onMonitorToggle={onMon}
        onPollingIntervalChange={onPI}
        onRead={onRead}
        pollingInterval={1000}
        readConfig={{ address: 0, functionCode: 3, quantity: 10 }}
        setReadConfig={
          setRead as unknown as (
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
    fireEvent.click(screen.getByRole("button", { name: /read once/i }));
    fireEvent.click(screen.getByRole("button", { name: /start monitor/i }));
    expect(onRead).toHaveBeenCalled();
    expect(onMon).toHaveBeenCalled();
  });
});

describe("WritePanel", () => {
  it("write button disabled until value provided for single write", () => {
    const setWrite = vi.fn();
    const onWrite = vi.fn();
    render(
      <WritePanel
        hexDisplay={false}
        isConnected={true}
        onWrite={onWrite}
        setWriteConfig={
          setWrite as unknown as (
            u: (p: {
              address: number;
              functionCode: 5 | 6 | 15 | 16;
              multiValues: string;
              quantity: number;
              value: string;
            }) => {
              address: number;
              functionCode: 5 | 6 | 15 | 16;
              multiValues: string;
              quantity: number;
              value: string;
            },
          ) => void
        }
        writeConfig={{
          address: 0,
          functionCode: 6,
          multiValues: "",
          quantity: 1,
          value: "",
        }}
      />,
    );
    const btn = screen.getByRole("button", { name: /^write$/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("DataDisplayPanel", () => {
  it("renders data rows and logs; copy entry handler fires", () => {
    const resp = makeResp(3, [10, 11]);
    const onClear = vi.fn();
    const onCopyAll = vi.fn();
    const onCopyEntry = vi.fn();
    const onHex = vi.fn();
    render(
      <DataDisplayPanel
        data={[resp]}
        formatAddress={(a) => String(a)}
        formatValue={(v) => String(v)}
        hexDisplay={false}
        logs={[{ message: "hello", timestamp: "12:00:00", type: "Info" }]}
        onClear={onClear}
        onCopyAll={onCopyAll}
        onCopyEntry={onCopyEntry}
        onHexToggle={onHex}
        readStartAddress={0}
      />,
    );
    expect(screen.getByText("10")).not.toBeNull();
    fireEvent.click(screen.getByTitle(/copy this log/i));
    expect(onCopyEntry).toHaveBeenCalled();
  });
});
