import type { SerialManager } from "../serial.ts";
import type {
  IModbusTransport,
  TransportEventMap,
} from "../transport/transport.ts";

export class SerialManagerTransport implements IModbusTransport {
  readonly config = {
    baudRate: 38400,
    dataBits: 8 as 7 | 8,
    parity: "none" as const,
    stopBits: 1 as 1 | 2,
    type: "serial" as const,
  };
  #target = new EventTarget();
  constructor(
    private sm: SerialManager,
    private log: (t: string, m: string) => void,
  ) {}
  get state() {
    return this.sm.connected ? "connected" : "disconnected";
  }
  get connected() {
    return this.sm.connected;
  }
  async connect(): Promise<void> {
    /* handled in UI */
  }
  async disconnect(): Promise<void> {
    await this.sm.disconnect();
  }
  postMessage(data: Uint8Array): void {
    this.log(
      "Sent",
      Array.from(data)
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" "),
    );
    void this.sm.send(data).catch((err) => {
      const ev = Object.assign(
        new CustomEvent<Error>("error", { detail: err }),
        { error: err },
      );
      this.#target.dispatchEvent(ev);
    });
  }
  addEventListener<K extends keyof TransportEventMap>(
    type: K,
    listener: (ev: TransportEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    if (type === "message") {
      const handler = (chunk: Uint8Array) => {
        const ev = new CustomEvent<Uint8Array>("message", { detail: chunk });
        listener(ev as TransportEventMap[K]);
      };
      this.sm.on("data", handler);
      options?.signal?.addEventListener(
        "abort",
        () => {
          this.sm.off("data", handler);
        },
        { once: true },
      );
      return;
    }
    if (type === "error") {
      const handler = (error: Error) => {
        const ev = Object.assign(
          new CustomEvent<Error>("error", { detail: error }),
          { error },
        );
        listener(ev as TransportEventMap[K]);
      };
      this.sm.on("error", handler);
      options?.signal?.addEventListener(
        "abort",
        () => {
          this.sm.off("error", handler);
        },
        { once: true },
      );
      return;
    }
  }
}
