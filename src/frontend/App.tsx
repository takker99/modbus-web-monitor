import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  readCoils as asciiReadCoils,
  readDiscreteInputs as asciiReadDiscreteInputs,
  readHoldingRegisters as asciiReadHoldingRegisters,
  readInputRegisters as asciiReadInputRegisters,
  writeMultipleCoils as asciiWriteMultipleCoils,
  writeMultipleRegisters as asciiWriteMultipleRegisters,
  writeSingleCoil as asciiWriteSingleCoil,
  writeSingleRegister as asciiWriteSingleRegister,
} from "../ascii.ts";
import type { ModbusProtocol } from "../frameBuilder.ts";
import type { WriteFunctionCode } from "../functionCodes.ts";
import type { ModbusResponse } from "../modbus.ts";
import { isOk, type Result } from "../result.ts";
import {
  readCoils as rtuReadCoils,
  readDiscreteInputs as rtuReadDiscreteInputs,
  readHoldingRegisters as rtuReadHoldingRegisters,
  readInputRegisters as rtuReadInputRegisters,
  writeMultipleCoils as rtuWriteMultipleCoils,
  writeMultipleRegisters as rtuWriteMultipleRegisters,
  writeSingleCoil as rtuWriteSingleCoil,
  writeSingleRegister as rtuWriteSingleRegister,
} from "../rtu.ts";
import type { SerialConfig, SerialManager } from "../serial.ts";
// --- SerialManager を IModbusTransport へアダプト ---
import type { IModbusTransport } from "../transport/transport.ts";
import { ConnectionSettingsPanel } from "./components/ConnectionSettingsPanel.tsx";
import { DataDisplayPanel } from "./components/DataDisplayPanel.tsx";
import { PortDisconnectedBanner } from "./components/PortDisconnectedBanner.tsx";
import { ReadPanel } from "./components/ReadPanel.tsx";
import { WritePanel } from "./components/WritePanel.tsx";
import { useLogs } from "./hooks/useLogs.ts";
import { usePolling } from "./hooks/usePolling.ts";
import { useSerial } from "./hooks/useSerial.ts";
import {
  parseCoilValues,
  parseRegisterValues,
  formatAddress as utilFormatAddress,
  formatValue as utilFormatValue,
} from "./modbusUtils.ts";
import { SerialManagerTransport } from "./SerialManagerTransport.ts";

// Extended interface for the UI state (includes additional fields for multi-value input)
interface ModbusWriteUIConfig {
  address: number;
  functionCode: WriteFunctionCode;
  multiValues: string; // For multi-write input (comma-separated or multi-line)
  quantity: number; // For multi-writes (FC15/16)
  value: string; // For single-value input
}

export function App() {
  // State management
  const { logs, addLog, clearLogs } = useLogs();
  const {
    manager: serialManager,
    connected: isConnected,
    portSelected,
    portDisconnected,
    reconnect: serialReconnect,
  } = useSerial();
  const {
    isPolling: isMonitoring,
    start: startPolling,
    stop: stopPolling,
  } = usePolling();
  const connectionStatus: "Disconnected" | "Connected" = isConnected
    ? "Connected"
    : "Disconnected";
  const [data, setData] = useState<ModbusResponse[]>([]);
  const [hexDisplay, setHexDisplay] = useState(false);

  // Serial configuration state
  const [serialConfig, setSerialConfig] = useState<SerialConfig>({
    baudRate: 38400,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
  });

  // Modbus configuration state
  const [slaveId, setSlaveId] = useState(1);
  const [protocol, setProtocol] = useState<ModbusProtocol>("rtu");
  interface UIReadConfig {
    functionCode: 1 | 2 | 3 | 4;
    quantity: number;
    startAddress: number;
  }
  const [readConfig, setReadConfig] = useState<UIReadConfig>({
    functionCode: 3,
    quantity: 10,
    startAddress: 0,
  });
  const [writeConfig, setWriteConfig] = useState<ModbusWriteUIConfig>({
    address: 0,
    functionCode: 6 as WriteFunctionCode,
    multiValues: "", // For multi-write input (comma-separated or multi-line)
    quantity: 1, // For multi-writes (FC15/16)
    value: "",
  });

  // Polling interval state (with localStorage persistence)
  const [pollingInterval, setPollingInterval] = useState(() => {
    const saved = localStorage.getItem("modbus-polling-interval");
    const interval = saved ? Number.parseInt(saved, 10) : 1000;
    // Clamp to valid range
    return Math.max(100, Math.min(60000, interval));
  });

  // Instances (initialized via useEffect)
  const transportRef = useRef<IModbusTransport | null>(null);

  useEffect(() => {
    // Web Serial API support check
    if (!("serial" in navigator)) {
      addLog(
        "Error",
        "This browser does not support the Web Serial API. Please use Chrome 89+.",
      );
      return;
    }

    // Event listeners setup
    if (!transportRef.current) {
      transportRef.current = new SerialManagerTransport(
        serialManager as SerialManager,
        addLog,
      );
    }

    return () => {
      serialManager.disconnect();
    };
  }, [serialManager, protocol, addLog]);

  const handlePortSelect = async () => {
    try {
      await serialManager.selectPort();
      addLog("Info", "Serial port selected");
    } catch (error) {
      addLog("Error", `Port selection error: ${(error as Error).message}`);
    }
  };

  const handleConnect = async () => {
    try {
      await serialManager.connect(serialConfig);
      addLog("Info", "Connected to serial port");
    } catch (error) {
      addLog("Error", `Connection error: ${(error as Error).message}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await serialManager.disconnect();
      addLog("Info", "Disconnected from serial port");
    } catch (error) {
      addLog("Error", `Disconnection error: ${(error as Error).message}`);
    }
  };

  const handleReconnect = async () => {
    try {
      addLog("Info", "Attempting to reconnect...");
      await serialReconnect(serialConfig);
      addLog("Info", "Reconnected successfully");
    } catch (error) {
      addLog("Error", `Reconnection error: ${(error as Error).message}`);
    }
  };

  const handleRead = async () => {
    if (!isConnected) return;
    const { functionCode, quantity, startAddress } = readConfig;
    const transport = transportRef.current;
    if (!transport) {
      addLog("Error", "Transport not ready");
      return;
    }
    const commonArgs: [IModbusTransport, number, number, number] = [
      transport,
      slaveId,
      startAddress,
      quantity,
    ];
    let result: Result<ModbusResponse, Error> | undefined;
    try {
      if (protocol === "rtu") {
        switch (functionCode) {
          case 1:
            result = await rtuReadCoils(...commonArgs);
            break;
          case 2:
            result = await rtuReadDiscreteInputs(...commonArgs);
            break;
          case 3:
            result = await rtuReadHoldingRegisters(...commonArgs);
            break;
          case 4:
            result = await rtuReadInputRegisters(...commonArgs);
            break;
        }
      } else {
        switch (functionCode) {
          case 1:
            result = await asciiReadCoils(...commonArgs);
            break;
          case 2:
            result = await asciiReadDiscreteInputs(...commonArgs);
            break;
          case 3:
            result = await asciiReadHoldingRegisters(...commonArgs);
            break;
          case 4:
            result = await asciiReadInputRegisters(...commonArgs);
            break;
        }
      }
      if (result && isOk(result)) {
        const resp = result.data;
        setData((prev) => [...prev.slice(-99), resp]);
        addLog(
          "Info",
          `Modbus response (${resp.functionCodeLabel}): received ${resp.data.length} values`,
        );
      } else if (result) {
        addLog("Error", `Read error: ${result.error.message}`);
      }
    } catch (e) {
      addLog("Error", `Read error: ${(e as Error).message}`);
    }
  };

  const handleWrite = async () => {
    if (!isConnected) return;
    try {
      let value: number | number[];
      const fc = writeConfig.functionCode;
      if (fc === 15) {
        value = parseCoilValues(writeConfig.multiValues);
        addLog(
          "Info",
          `Writing ${value.length} coils starting at address ${writeConfig.address}`,
        );
      } else if (fc === 16) {
        value = parseRegisterValues(writeConfig.multiValues, {
          hex: hexDisplay,
        });
        addLog(
          "Info",
          `Writing ${value.length} registers starting at address ${writeConfig.address}`,
        );
      } else {
        value = hexDisplay
          ? Number.parseInt(writeConfig.value, 16)
          : Number.parseInt(writeConfig.value, 10);
        if (Number.isNaN(value)) throw new Error("Invalid value format");
      }
      let result: Result<void, Error> | undefined;
      const t = transportRef.current;
      if (!t) {
        addLog("Error", "Transport not ready");
        return;
      }
      if (protocol === "rtu") {
        switch (fc) {
          case 5:
            result = await rtuWriteSingleCoil(
              t,
              slaveId,
              writeConfig.address,
              (value as number) !== 0,
            );
            break;
          case 6:
            result = await rtuWriteSingleRegister(
              t,
              slaveId,
              writeConfig.address,
              value as number,
            );
            break;
          case 15:
            result = await rtuWriteMultipleCoils(
              t,
              slaveId,
              writeConfig.address,
              (value as number[]).map((v) => v !== 0),
            );
            break;
          case 16:
            result = await rtuWriteMultipleRegisters(
              t,
              slaveId,
              writeConfig.address,
              value as number[],
            );
            break;
        }
      } else {
        switch (fc) {
          case 5:
            result = await asciiWriteSingleCoil(
              t,
              slaveId,
              writeConfig.address,
              (value as number) !== 0,
            );
            break;
          case 6:
            result = await asciiWriteSingleRegister(
              t,
              slaveId,
              writeConfig.address,
              value as number,
            );
            break;
          case 15:
            result = await asciiWriteMultipleCoils(
              t,
              slaveId,
              writeConfig.address,
              (value as number[]).map((v) => v !== 0),
            );
            break;
          case 16:
            result = await asciiWriteMultipleRegisters(
              t,
              slaveId,
              writeConfig.address,
              value as number[],
            );
            break;
        }
      }
      if (result && !isOk(result)) {
        addLog("Error", `Write error: ${result.error.message}`);
      } else {
        addLog("Info", `Write success (FC${fc})`);
      }
    } catch (e) {
      addLog("Error", `Write error: ${(e as Error).message}`);
    }
  };

  const handleMonitorToggle = () => {
    if (isMonitoring) {
      stopPolling();
      addLog("Info", "Stopped monitoring");
      return;
    }
    startPolling(handleRead, pollingInterval);
    addLog("Info", `Started monitoring (interval: ${pollingInterval}ms)`);
  };

  const handleProtocolChange = (newProtocol: ModbusProtocol) => {
    if (isMonitoring) stopPolling();
    setProtocol(newProtocol);
    addLog("Info", `Protocol changed to ${newProtocol.toUpperCase()}`);
  };

  const handlePollingIntervalChange = (value: number) => {
    // Clamp to valid range
    const clampedValue = Math.max(100, Math.min(60000, value));
    setPollingInterval(clampedValue);
    localStorage.setItem("modbus-polling-interval", clampedValue.toString());

    if (clampedValue !== value) {
      addLog(
        "Warning",
        `Polling interval clamped to ${clampedValue}ms (valid range: 100-60000ms)`,
      );
    }
  };

  const clearLogsAndData = () => {
    clearLogs();
    setData([]);
  };

  const copyLogEntry = async (log: {
    timestamp: string;
    type: string;
    message: string;
  }) => {
    try {
      const text = `${log.timestamp} [${log.type}] ${log.message}`;
      await navigator.clipboard.writeText(text);
      console.log("Copied log entry:", text);
    } catch (err) {
      console.error("Failed to copy log entry:", err);
    }
  };

  const copyAllLogs = useCallback(async () => {
    try {
      const allLogsText = logs
        .map((log) => `${log.timestamp} [${log.type}] ${log.message}`)
        .join("\n");
      await navigator.clipboard.writeText(allLogsText);
      console.log("Copied all logs");
    } catch (err) {
      console.error("Failed to copy all logs:", err);
    }
  }, [logs]);

  const formatValue = (value: number) =>
    utilFormatValue(value, { hex: hexDisplay });

  // Memoized event handlers to prevent unnecessary re-renders
  // handlers now embedded inside subcomponents
  // Helper functions for multi-write operations
  const formatAddress = (address: number) =>
    utilFormatAddress(address, { hex: hexDisplay });

  return (
    <div className="container">
      <header className="header">
        <h1>Modbus Web Monitor</h1>
        <div className="connection-status">
          <span
            className={
              connectionStatus === "Connected"
                ? "status-connected"
                : "status-disconnected"
            }
          >
            {connectionStatus}
          </span>
        </div>
      </header>
      {portDisconnected && (
        <PortDisconnectedBanner onReconnect={handleReconnect} />
      )}
      <main className="main-content">
        <ConnectionSettingsPanel
          isConnected={isConnected}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onProtocolChange={handleProtocolChange}
          onSelectPort={handlePortSelect}
          onSlaveIdChange={setSlaveId}
          portSelected={portSelected}
          protocol={protocol}
          serialConfig={serialConfig}
          setSerialConfig={setSerialConfig}
          slaveId={slaveId}
        />
        <ReadPanel
          isConnected={isConnected}
          isMonitoring={isMonitoring}
          onMonitorToggle={handleMonitorToggle}
          onPollingIntervalChange={handlePollingIntervalChange}
          onRead={handleRead}
          pollingInterval={pollingInterval}
          readConfig={readConfig}
          setReadConfig={setReadConfig}
        />
        <WritePanel
          hexDisplay={hexDisplay}
          isConnected={isConnected}
          onWrite={handleWrite}
          setWriteConfig={setWriteConfig}
          writeConfig={writeConfig}
        />
        <DataDisplayPanel
          data={data}
          formatAddress={formatAddress}
          formatValue={formatValue}
          hexDisplay={hexDisplay}
          logs={logs}
          onClear={clearLogsAndData}
          onCopyAll={copyAllLogs}
          onCopyEntry={copyLogEntry}
          onHexToggle={(checked) => setHexDisplay(checked)}
          readStartAddress={readConfig.startAddress}
        />
      </main>
    </div>
  );
}
