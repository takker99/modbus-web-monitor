/** Minimal mock SerialPort implementing open/close + writable/readable shape.
 * Provides:
 *  - A readable stream that emits a single Uint8Array([1,2,3]) chunk upon first open.
 *  - An error injection hook via mockReader.simulateError(new Error(...)).
 */
export class MockSerialPort implements SerialPort {
  #connected = false;
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  #emittedInitialChunk = false;

  // Expose connected flag like real SerialPort (readonly in spec, mutable here for tests)
  get connected(): boolean {
    return this.#connected;
  }

  readable: ReadableStream<Uint8Array> | null = null;
  get writable(): WritableStream<Uint8Array> | null {
    return {
      getWriter: () => ({
        close: () => Promise.resolve(),
        releaseLock: () => {},
        write: () => Promise.resolve(),
      }),
    } as unknown as WritableStream<Uint8Array>;
  }
  getInfo(): SerialPortInfo {
    return { usbProductId: 1, usbVendorId: 2 };
  }
  forget(): Promise<void> {
    return Promise.resolve();
  }

  /** Hook used by tests to trigger a read error in the active reader loop. */
  readonly mockReader = {
    simulateError: (e: Error) => {
      // Trigger stream error; SerialTransport loop should catch & dispatch.
      this.#controller?.error(e);
    },
  };

  async open(_config: SerialOptions) {
    if (this.#connected) throw new Error("Port already open");
    this.#connected = true;
    // Create a fresh readable stream for each open
    this.readable = new ReadableStream<Uint8Array>({
      cancel: () => {
        this.#controller = null;
      },
      start: (controller) => {
        this.#controller = controller;
        // Emit initial chunk once (tests rely on this)
        if (!this.#emittedInitialChunk) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          this.#emittedInitialChunk = true;
        }
        // Keep stream open for potential injected error; tests will advance time.
      },
    });
  }

  async close() {
    this.#connected = false;
    // Close controller if still open
    try {
      this.#controller?.close();
    } catch {}
    this.#controller = null;
    this.readable = null;
  }
  addEventListener(): void {}
  removeEventListener(): void {}

  onconnect: ((this: SerialPort, ev: Event) => void) | null = null;
  ondisconnect: ((this: SerialPort, ev: Event) => void) | null = null;

  dispatchEvent(): boolean {
    return true;
  }
  setSignals(): Promise<void> {
    return Promise.resolve();
  }
  getSignals(): Promise<SerialInputSignals> {
    return Promise.resolve({} as SerialInputSignals);
  }
  // Mark as SerialPort via structural typing when cast
}
