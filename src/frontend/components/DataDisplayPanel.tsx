import type { FunctionalComponent } from "preact";
import { FUNCTION_CODE_LABELS } from "../../functionCodes.ts";
import type { ModbusResponse } from "../../modbus.ts";

interface Props {
  data: ModbusResponse[];
  readStartAddress: number;
  hexDisplay: boolean;
  formatAddress: (addr: number) => string;
  formatValue: (v: number) => string;
  logs: { timestamp: string; type: string; message: string }[];
  onClear: () => void;
  onCopyAll: () => void;
  onCopyEntry: (log: {
    timestamp: string;
    type: string;
    message: string;
  }) => void;
  onHexToggle: (checked: boolean) => void;
}

export const DataDisplayPanel: FunctionalComponent<Props> = ({
  data,
  readStartAddress,
  hexDisplay,
  formatAddress,
  formatValue,
  logs,
  onClear,
  onCopyAll,
  onCopyEntry,
  onHexToggle,
}) => (
  <section className="panel data-panel">
    <h2>Data Display</h2>
    <div className="data-controls">
      <label>
        <input
          checked={hexDisplay}
          onChange={(e) => onHexToggle(e.currentTarget.checked)}
          type="checkbox"
        />{" "}
        Hex Display
      </label>
      <button className="btn btn-secondary" onClick={onClear} type="button">
        Clear Logs
      </button>
      <button className="btn btn-secondary" onClick={onCopyAll} type="button">
        Copy All Logs
      </button>
    </div>
    <div className="data-display">
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Address</th>
              <th>Value</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {data.flatMap((resp) =>
              resp.data.map((value, idx) => {
                const addr = (resp.address ?? readStartAddress) + idx;
                return (
                  <tr key={`resp-${resp.timestamp.getTime()}-${addr}-${idx}`}>
                    <td>
                      {resp.functionCodeLabel ||
                        FUNCTION_CODE_LABELS[
                          resp.functionCode as keyof typeof FUNCTION_CODE_LABELS
                        ] ||
                        `FC${resp.functionCode}`}
                    </td>
                    <td>{formatAddress(addr)}</td>
                    <td>{formatValue(value)}</td>
                    <td>{resp.timestamp.toLocaleTimeString()}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <div className="log-container">
        <h3>Communication Log</h3>
        <div className="log-display">
          {logs.map((log, i) => (
            <div
              className={`log-entry log-${log.type === "Error" ? "error" : log.type === "Sent" ? "sent" : log.type === "Received" ? "received" : "info"}`}
              key={`log-${log.timestamp}-${i}`}
            >
              <span className="log-timestamp">{log.timestamp}</span>
              <span className="log-direction">[{log.type}]</span>
              <span className="log-data">{log.message}</span>
              <button
                className="log-copy-btn"
                onClick={() => onCopyEntry(log)}
                title="Copy this log"
                type="button"
              >
                📋
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);
