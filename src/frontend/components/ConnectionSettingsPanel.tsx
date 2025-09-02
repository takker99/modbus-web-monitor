import type { FunctionalComponent } from "preact";
import type { ModbusProtocol } from "../../frameBuilder.ts";
import type { SerialConfig } from "../../serial.ts";

interface Props {
  serialConfig: SerialConfig;
  setSerialConfig: (updater: (prev: SerialConfig) => SerialConfig) => void;
  protocol: ModbusProtocol;
  onProtocolChange: (p: ModbusProtocol) => void;
  slaveId: number;
  onSlaveIdChange: (id: number) => void;
  isConnected: boolean;
  portSelected: boolean;
  onSelectPort: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const ConnectionSettingsPanel: FunctionalComponent<Props> = ({
  serialConfig,
  setSerialConfig,
  protocol,
  onProtocolChange,
  slaveId,
  onSlaveIdChange,
  isConnected,
  portSelected,
  onSelectPort,
  onConnect,
  onDisconnect,
}) => (
  <section className="panel connection-panel">
    <h2>Connection Settings</h2>
    <div className="form-group">
      <div className="form-label">Serial Port:</div>
      <div className="port-controls">
        <button
          className="btn btn-primary"
          disabled={isConnected}
          onClick={onSelectPort}
          type="button"
        >
          Select Port
        </button>
        <button
          className="btn btn-success"
          disabled={!portSelected || isConnected}
          onClick={onConnect}
          type="button"
        >
          Connect
        </button>
        <button
          className="btn btn-danger"
          disabled={!isConnected}
          onClick={onDisconnect}
          type="button"
        >
          Disconnect
        </button>
      </div>
    </div>
    <div className="form-row">
      <div className="form-group">
        <label htmlFor="baudRate">Baud Rate:</label>
        <select
          disabled={isConnected}
          id="baudRate"
          onChange={(e) =>
            setSerialConfig((prev) => ({
              ...prev,
              baudRate: Number(e.currentTarget.value),
            }))
          }
          value={serialConfig.baudRate}
        >
          {[9600, 19200, 38400, 57600, 115200].map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="dataBits">Data Bits:</label>
        <select
          disabled={isConnected}
          id="dataBits"
          onChange={(e) =>
            setSerialConfig((prev) => ({
              ...prev,
              dataBits: Number(e.currentTarget.value) as 7 | 8,
            }))
          }
          value={serialConfig.dataBits}
        >
          {[7, 8].map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="parity">Parity:</label>
        <select
          disabled={isConnected}
          id="parity"
          onChange={(e) =>
            setSerialConfig((prev) => ({
              ...prev,
              parity: e.currentTarget.value as "none" | "even" | "odd",
            }))
          }
          value={serialConfig.parity}
        >
          {["none", "even", "odd"].map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="stopBits">Stop Bits:</label>
        <select
          disabled={isConnected}
          id="stopBits"
          onChange={(e) =>
            setSerialConfig((prev) => ({
              ...prev,
              stopBits: Number(e.currentTarget.value) as 1 | 2,
            }))
          }
          value={serialConfig.stopBits}
        >
          {[1, 2].map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
    </div>
    <div className="form-row">
      <div className="form-group">
        <label htmlFor="slaveId">Slave ID:</label>
        <input
          disabled={isConnected}
          id="slaveId"
          max={247}
          min={1}
          onChange={(e) => onSlaveIdChange(Number(e.currentTarget.value))}
          type="number"
          value={slaveId}
        />
      </div>
      <div className="form-group">
        <label htmlFor="protocol">Protocol:</label>
        <select
          disabled={isConnected}
          id="protocol"
          onChange={(e) =>
            onProtocolChange(e.currentTarget.value as ModbusProtocol)
          }
          value={protocol}
        >
          <option value="rtu">Modbus RTU</option>
          <option value="ascii">Modbus ASCII</option>
        </select>
      </div>
    </div>
  </section>
);
