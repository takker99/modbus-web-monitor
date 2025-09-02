import { useCallback, useRef, useState } from "preact/hooks";
import { SerialTransport } from "../../transport/serial-transport.ts";

export interface UseSerialOptions {
  requestPort?: (options?: SerialPortRequestOptions) => Promise<SerialPort>;
}

export interface UseSerialResult {
  transport?: SerialTransport;
  selectPort: () => Promise<void>;
}

export function useSerial(
  config: SerialOptions,
  options?: UseSerialOptions,
): UseSerialResult {
  const [transport, setTransport] = useState<SerialTransport>();
  const disposeRef = useRef<() => Promise<void>>(async () => {});

  const selectPort = useCallback(async () => {
    const previousDispose = disposeRef.current;
    const chain = previousDispose()
      .then(() => (options?.requestPort ?? navigator.serial.requestPort)())
      .then((port) => {
        const t = new SerialTransport({ ...config, type: "serial" }, port);
        setTransport(t); // schedule render with new transport
        return t;
      });
    disposeRef.current = async () => {
      const t = await chain;
      await t.disconnect();
    };
    await chain;
  }, [options?.requestPort]);

  return { selectPort, transport };
}
