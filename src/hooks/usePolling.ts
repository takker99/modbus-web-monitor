import { useCallback, useRef, useState } from "preact/hooks";

export interface UsePollingOptions {
  setIntervalFn?: typeof window.setInterval;
  clearIntervalFn?: typeof window.clearInterval;
}

export interface UsePollingResult {
  isPolling: boolean;
  start: (fn: () => void, interval: number) => void;
  stop: () => void;
  restart: (fn: () => void, interval: number) => void;
}

export function usePolling(opts: UsePollingOptions = {}): UsePollingResult {
  const {
    setIntervalFn = window.setInterval.bind(window),
    clearIntervalFn = window.clearInterval.bind(window),
  } = opts;
  const [isPolling, setIsPolling] = useState(false);
  const idRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (idRef.current !== null) {
      clearIntervalFn(idRef.current);
      idRef.current = null;
    }
    setIsPolling(false);
  }, [clearIntervalFn]);

  const start = useCallback(
    (fn: () => void, interval: number) => {
      if (idRef.current !== null) return; // already polling
      idRef.current = setIntervalFn(fn, interval);
      setIsPolling(true);
    },
    [setIntervalFn],
  );

  const restart = useCallback(
    (fn: () => void, interval: number) => {
      stop();
      start(fn, interval);
    },
    [stop, start],
  );

  return { isPolling, restart, start, stop };
}
