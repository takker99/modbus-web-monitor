import { useEffect, useMemo, useState } from "preact/hooks";
import { type SerialConfig, SerialManager } from "../serial.ts";

// For test/mocking we expose the shape required; a mock can implement these members.
export interface SerialManagerLike {
  on: (ev: string, listener: (...args: unknown[]) => void) => void;
  off: (ev: string, listener: (...args: unknown[]) => void) => void;
  selectPort: () => Promise<void>;
  connect: (c: SerialConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: (c: SerialConfig) => Promise<void>;
}

export interface UseSerialOptions {
  manager?: SerialManager | SerialManagerLike; // DI for testing
}

export interface UseSerialResult {
  manager: SerialManager | SerialManagerLike;
  connected: boolean;
  portSelected: boolean;
  portDisconnected: boolean;
  selectPort: () => Promise<void>;
  connect: (config: SerialConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: (config: SerialConfig) => Promise<void>;
}

export function useSerial(opts: UseSerialOptions = {}): UseSerialResult {
  const manager = useMemo(
    () => opts.manager ?? new SerialManager(),
    [opts.manager],
  );
  const [connected, setConnected] = useState(false);
  const [portSelected, setPortSelected] = useState(false);
  const [portDisconnected, setPortDisconnected] = useState(false);

  useEffect(() => {
    const onPortSelected = () => setPortSelected(true);
    const onConnected = () => {
      setConnected(true);
      setPortDisconnected(false);
    };
    const onDisconnected = () => setConnected(false);
    const onPortDisconnected = () => {
      setConnected(false);
      setPortDisconnected(true);
    };
    manager.on("portSelected", onPortSelected);
    manager.on("connected", onConnected);
    manager.on("disconnected", onDisconnected);
    manager.on("portDisconnected", onPortDisconnected);
    return () => {
      manager.off("portSelected", onPortSelected);
      manager.off("connected", onConnected);
      manager.off("disconnected", onDisconnected);
      manager.off("portDisconnected", onPortDisconnected);
    };
  }, [manager]);

  return {
    connect: (c: SerialConfig) => manager.connect(c),
    connected,
    disconnect: () => manager.disconnect(),
    manager,
    portDisconnected,
    portSelected,
    reconnect: (c: SerialConfig) => manager.reconnect(c),
    selectPort: () => manager.selectPort(),
  };
}
