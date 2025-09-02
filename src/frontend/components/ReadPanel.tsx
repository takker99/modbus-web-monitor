import type { FunctionalComponent } from "preact";
import type { ReadFunctionCode } from "../../functionCodes";

interface ReadConfig {
  functionCode: ReadFunctionCode;
  quantity: number;
  address: number;
}
interface Props {
  isConnected: boolean;
  isMonitoring: boolean;
  readConfig: ReadConfig;
  setReadConfig: (updater: (prev: ReadConfig) => ReadConfig) => void;
  pollingInterval: number;
  onPollingIntervalChange: (ms: number) => void;
  onRead: () => void;
  onMonitorToggle: () => void;
}

export const ReadPanel: FunctionalComponent<Props> = ({
  isConnected,
  isMonitoring,
  readConfig,
  setReadConfig,
  pollingInterval,
  onPollingIntervalChange,
  onRead,
  onMonitorToggle,
}) => (
  <section className="panel read-panel">
    <h2>Read Data</h2>
    <div className="form-row">
      <div className="form-group">
        <label htmlFor="readFunctionCode">Function Code:</label>
        <select
          disabled={!isConnected}
          id="readFunctionCode"
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            if ([1, 2, 3, 4].includes(v))
              setReadConfig((prev) => ({
                ...prev,
                functionCode: v as 1 | 2 | 3 | 4,
              }));
          }}
          value={readConfig.functionCode}
        >
          <option value={1}>01 - Read Coils</option>
          <option value={2}>02 - Read Discrete Inputs</option>
          <option value={3}>03 - Read Holding Registers</option>
          <option value={4}>04 - Read Input Registers</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="startAddress">Start Address:</label>
        <input
          disabled={!isConnected}
          id="startAddress"
          max={65535}
          min={0}
          onChange={(e) =>
            setReadConfig((prev) => ({
              ...prev,
              address: Number(e.currentTarget.value),
            }))
          }
          type="number"
          value={readConfig.address}
        />
      </div>
      <div className="form-group">
        <label htmlFor="quantity">Quantity:</label>
        <input
          disabled={!isConnected}
          id="quantity"
          max={125}
          min={1}
          onChange={(e) =>
            setReadConfig((prev) => ({
              ...prev,
              quantity: Number(e.currentTarget.value),
            }))
          }
          type="number"
          value={readConfig.quantity}
        />
      </div>
      <div className="form-group">
        <label htmlFor="pollingInterval">Polling Interval (ms):</label>
        <input
          disabled={!isConnected}
          id="pollingInterval"
          max={60000}
          min={100}
          onChange={(e) =>
            onPollingIntervalChange(Number(e.currentTarget.value))
          }
          type="number"
          value={pollingInterval}
        />
      </div>
      <div className="form-group">
        <button
          className="btn btn-primary"
          disabled={!isConnected || isMonitoring}
          onClick={onRead}
          type="button"
        >
          Read Once
        </button>
        <button
          className="btn btn-secondary"
          disabled={!isConnected}
          onClick={onMonitorToggle}
          type="button"
        >
          {isMonitoring ? "Stop Monitor" : "Start Monitor"}
        </button>
      </div>
    </div>
  </section>
);
