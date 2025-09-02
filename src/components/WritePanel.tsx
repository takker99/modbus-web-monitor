import type { FunctionalComponent } from "preact";
import type { WriteFunctionCode } from "../functionCodes.ts";

interface WriteConfigUI {
  address: number;
  functionCode: WriteFunctionCode;
  multiValues: string;
  quantity: number;
  value: string;
}

interface Props {
  isConnected: boolean;
  writeConfig: WriteConfigUI;
  setWriteConfig: (updater: (prev: WriteConfigUI) => WriteConfigUI) => void;
  hexDisplay: boolean;
  onWrite: () => void;
}

export const WritePanel: FunctionalComponent<Props> = ({
  isConnected,
  writeConfig,
  setWriteConfig,
  hexDisplay,
  onWrite,
}) => (
  <section className="panel write-panel">
    <h2>Write Data</h2>
    <div className="form-row">
      <div className="form-group">
        <label htmlFor="writeFunctionCode">Function Code:</label>
        <select
          disabled={!isConnected}
          id="writeFunctionCode"
          onChange={(e) =>
            setWriteConfig((prev) => ({
              ...prev,
              functionCode: Number(e.currentTarget.value) as WriteFunctionCode,
            }))
          }
          value={writeConfig.functionCode}
        >
          <option value={5}>05 - Write Single Coil</option>
          <option value={6}>06 - Write Single Register</option>
          <option value={15}>15 - Write Multiple Coils</option>
          <option value={16}>16 - Write Multiple Registers</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="writeAddress">
          {[15, 16].includes(writeConfig.functionCode)
            ? "Start Address:"
            : "Write Address:"}
        </label>
        <input
          disabled={!isConnected}
          id="writeAddress"
          max={65535}
          min={0}
          onChange={(e) =>
            setWriteConfig((prev) => ({
              ...prev,
              address: Number(e.currentTarget.value),
            }))
          }
          type="number"
          value={writeConfig.address}
        />
      </div>
      {[5, 6].includes(writeConfig.functionCode) && (
        <div className="form-group">
          <label htmlFor="writeValue">Value:</label>
          <input
            disabled={!isConnected}
            id="writeValue"
            onChange={(e) =>
              setWriteConfig((prev) => ({
                ...prev,
                value: e.currentTarget.value,
              }))
            }
            placeholder="e.g. 1234 or 0x04D2"
            type="text"
            value={writeConfig.value}
          />
        </div>
      )}
      {writeConfig.functionCode === 15 && (
        <div className="form-group">
          <label htmlFor="multiCoilValues">Coil Values (0/1):</label>
          <textarea
            disabled={!isConnected}
            id="multiCoilValues"
            onChange={(e) =>
              setWriteConfig((prev) => ({
                ...prev,
                multiValues: e.currentTarget.value,
              }))
            }
            placeholder="e.g. 1,0,1,1,0 or 1 0 1 1 0 (max 1968 coils)"
            rows={3}
            value={writeConfig.multiValues}
          />
          <small style={{ color: "#666", fontSize: "12px" }}>
            Enter comma or space-separated bits (0 or 1). Max 1968 coils.
          </small>
        </div>
      )}
      {writeConfig.functionCode === 16 && (
        <div className="form-group">
          <label htmlFor="multiRegisterValues">Register Values:</label>
          <textarea
            disabled={!isConnected}
            id="multiRegisterValues"
            onChange={(e) =>
              setWriteConfig((prev) => ({
                ...prev,
                multiValues: e.currentTarget.value,
              }))
            }
            placeholder={
              hexDisplay
                ? "e.g. 0x1234,0x5678 or line-separated (max 123 registers)"
                : "e.g. 1234,5678 or line-separated (max 123 registers)"
            }
            rows={4}
            value={writeConfig.multiValues}
          />
          <small style={{ color: "#666", fontSize: "12px" }}>
            Enter comma, space, or line-separated values (0-65535). Max 123
            registers.{hexDisplay && " Use 0x prefix for hex values."}
          </small>
        </div>
      )}
      <div className="form-group">
        <button
          className="btn btn-warning"
          disabled={
            !isConnected ||
            ([5, 6].includes(writeConfig.functionCode)
              ? !writeConfig.value
              : !writeConfig.multiValues)
          }
          onClick={onWrite}
          type="button"
        >
          Write
        </button>
      </div>
    </div>
  </section>
);
