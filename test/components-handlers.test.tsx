//@vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionSettingsPanel } from "../src/frontend/components/ConnectionSettingsPanel.tsx";
import { ReadPanel } from "../src/frontend/components/ReadPanel.tsx";
import { WritePanel } from "../src/frontend/components/WritePanel.tsx";

// Ensure DOM is cleared between tests to avoid duplicate label conflicts
afterEach(() => cleanup());

describe("WritePanel handler coverage", () => {
  it("fires onChange for all write function variants", () => {
    const spy = vi.fn();
    const base = {
      address: 0,
      functionCode: 5 as 5 | 6 | 15 | 16,
      multiValues: "",
      quantity: 0,
      value: "",
    };
    // single coil
    {
      const { getByLabelText } = render(
        <WritePanel
          hexDisplay={false}
          isConnected={true}
          onWrite={() => {}}
          setWriteConfig={
            spy as unknown as (u: (p: typeof base) => typeof base) => void
          }
          writeConfig={base}
        />,
      );
      fireEvent.change(getByLabelText(/value/i), { target: { value: "123" } });
      cleanup();
    }
    // single register
    {
      const { getByLabelText } = render(
        <WritePanel
          hexDisplay={false}
          isConnected={true}
          onWrite={() => {}}
          setWriteConfig={
            spy as unknown as (u: (p: typeof base) => typeof base) => void
          }
          writeConfig={{ ...base, functionCode: 6 }}
        />,
      );
      fireEvent.change(getByLabelText(/value/i), { target: { value: "456" } });
      cleanup();
    }
    // multi coils
    {
      const { getByLabelText } = render(
        <WritePanel
          hexDisplay={false}
          isConnected={true}
          onWrite={() => {}}
          setWriteConfig={
            spy as unknown as (u: (p: typeof base) => typeof base) => void
          }
          writeConfig={{ ...base, functionCode: 15 }}
        />,
      );
      fireEvent.change(getByLabelText(/coil values/i), {
        target: { value: "1,0,1" },
      });
      cleanup();
    }
    // multi registers
    {
      const { getByLabelText } = render(
        <WritePanel
          hexDisplay={true}
          isConnected={true}
          onWrite={() => {}}
          setWriteConfig={
            spy as unknown as (u: (p: typeof base) => typeof base) => void
          }
          writeConfig={{ ...base, functionCode: 16 }}
        />,
      );
      fireEvent.change(getByLabelText(/register values/i), {
        target: { value: "0x1234,0x5678" },
      });
    }
    expect(spy).toHaveBeenCalled();
  });
});

describe("ConnectionSettingsPanel full handlers", () => {
  it("fires all change handlers including dataBits and stopBits", () => {
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
      target: { value: "38400" },
    });
    fireEvent.change(screen.getByLabelText(/data bits/i), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText(/parity/i), {
      target: { value: "even" },
    });
    fireEvent.change(screen.getByLabelText(/stop bits/i), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(/slave id/i), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText(/protocol/i), {
      target: { value: "ascii" },
    });
    expect(setSerial).toHaveBeenCalledTimes(4); // baud,dataBits,parity,stopBits
    expect(onProt).toHaveBeenCalledWith("ascii");
    expect(onSlave).toHaveBeenCalledWith(3);
  });
});

describe("ReadPanel handlers", () => {
  it("fires all read change handlers", () => {
    const setRead = vi.fn();
    const onPI = vi.fn();
    const { getByLabelText } = render(
      <ReadPanel
        isConnected={true}
        isMonitoring={false}
        onMonitorToggle={() => {}}
        onPollingIntervalChange={onPI}
        onRead={() => {}}
        pollingInterval={1000}
        readConfig={{ address: 0, functionCode: 1, quantity: 1 }}
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
    fireEvent.change(getByLabelText(/function code/i), {
      target: { value: "4" },
    });
    fireEvent.change(getByLabelText(/start address/i), {
      target: { value: "5" },
    });
    fireEvent.change(getByLabelText(/quantity/i), { target: { value: "10" } });
    fireEvent.change(getByLabelText(/polling interval/i), {
      target: { value: "1500" },
    });
    expect(setRead).toHaveBeenCalledTimes(3);
    expect(onPI).toHaveBeenCalledWith(1500);
  });
});
