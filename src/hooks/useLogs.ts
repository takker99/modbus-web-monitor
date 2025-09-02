import { useCallback, useState } from "preact/hooks";
import type { LogEntry } from "../utils/modbusUtils.ts";

export interface UseLogsOptions {
  now?: () => Date; // DI for testing
  max?: number; // default 100
}

export interface UseLogsResult {
  logs: LogEntry[];
  addLog: (type: string, message: string) => void;
  clearLogs: () => void;
}

export function useLogs(opts: UseLogsOptions = {}): UseLogsResult {
  const { now = () => new Date(), max = 100 } = opts;
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback(
    (type: string, message: string) => {
      const time = now().toLocaleTimeString();
      setLogs((prev) => [
        ...prev.slice(-(max - 1)),
        { message, timestamp: time, type },
      ]);
    },
    [now, max],
  );

  const clearLogs = useCallback(() => setLogs([]), []);

  return { addLog, clearLogs, logs };
}
