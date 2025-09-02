/** Serial communication configuration types */
export interface SerialConfig {
  baudRate: number;
  dataBits: 7 | 8;
  parity: "none" | "even" | "odd";
  stopBits: 1 | 2;
}

/** Event types emitted by SerialManager */
type SerialManagerEvents = {
  portSelected: [SerialPort];
  connected: [];
  disconnected: [];
  /** Unexpected disconnect (cable unplug, permission revocation) */
  portDisconnected: [];
  error: [Error];
  data: [Uint8Array];
};

/** Minimal strongly-typed event emitter used across the transport layer. */
export class EventEmitter<
  T extends Record<string, unknown[]> = Record<string, unknown[]>,
> {
  #listeners: { [K in keyof T]?: Array<(...args: T[K]) => void> } = {};

  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void) {
    if (!this.#listeners[event]) {
      this.#listeners[event] = [];
    }
    const eventListeners = this.#listeners[event];
    if (eventListeners) {
      eventListeners.push(listener);
    }
  }

  off<K extends keyof T>(event: K, listener: (...args: T[K]) => void) {
    const eventListeners = this.#listeners[event];
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  emit<K extends keyof T>(event: K, ...args: T[K]) {
    const eventListeners = this.#listeners[event];
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        listener(...args);
      });
    }
  }
}

/** Serial communication manager using the Web Serial API. */
export class SerialManager extends EventEmitter<SerialManagerEvents> {
  #port: SerialPort | null = null;
  #reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  #isConnected = false;

  /** For test case */
  protected set isConnected(connected: boolean) {
    this.#isConnected = connected;
  }

  /** Prompt user to select a serial port. Emits `portSelected` on success. */
  async selectPort(): Promise<void> {
    console.log("SerialManager: starting port selection");
    try {
      this.#port = await navigator.serial.requestPort();
      console.log("SerialManager: port selected", this.#port);
      this.emit("portSelected", this.#port);
    } catch (error) {
      console.error("SerialManager: port selection error", error);
      throw new Error(`Failed to select port: ${(error as Error).message}`);
    }
  }

  /**
   * Open the selected port with the provided serial configuration.
   * On success starts background reading and exposes a writer.
   */
  async connect(config: SerialConfig): Promise<void> {
    console.log("SerialManager: starting connection", config);
    if (!this.#port) {
      throw new Error("No port selected");
    }

    if (this.#isConnected) {
      throw new Error("Already connected");
    }

    try {
      await this.#port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        flowControl: "none",
        parity: config.parity,
        stopBits: config.stopBits,
      });

      console.log("SerialManager: port opened");
      this.#isConnected = true;

      // Setup reader and writer if available on the port
      if (this.#port.readable) {
        this.#reader = this.#port.readable.getReader();
        this.#startReading();
      }

      if (this.#port.writable) {
        this.#writer = this.#port.writable.getWriter();
      } else {
        this.#writer = null;
      }

      this.emit("connected");
    } catch (error) {
      this.#isConnected = false;
      throw new Error(`Failed to connect: ${(error as Error).message}`);
    }
  }

  /**
   * Gracefully close reader, writer and port. Emits `disconnected` on
   * successful teardown.
   */
  async disconnect(): Promise<void> {
    if (!this.#isConnected) {
      return;
    }

    try {
      // Mark as disconnecting to prevent unexpected disconnect events
      this.#isConnected = false;

      // Cancel and release reader
      if (this.#reader) {
        try {
          await this.#reader.cancel();
        } catch (error) {
          console.log(
            "SerialManager: Reader cancel failed (port may be closed)",
            error,
          );
        }
        try {
          this.#reader.releaseLock();
        } catch (error) {
          console.log("SerialManager: Reader releaseLock failed", error);
        }
        this.#reader = null;
      }

      // Close writer
      if (this.#writer) {
        try {
          await this.#writer.close();
        } catch (error) {
          console.log(
            "SerialManager: Writer close failed (port may be closed)",
            error,
          );
        }
        this.#writer = null;
      }

      // Close port
      if (this.#port) {
        try {
          await this.#port.close();
        } catch (error) {
          console.log(
            "SerialManager: Port close failed (port may be closed)",
            error,
          );
        }
      }

      this.emit("disconnected");
    } catch (error) {
      throw new Error(`Failed to disconnect: ${(error as Error).message}`);
    }
  }

  /** Write raw bytes to the serial port. */
  async send(data: Uint8Array): Promise<void> {
    if (!this.#writer) {
      throw new Error("Serial port not open");
    }

    try {
      await this.#writer.write(data);
    } catch (error) {
      throw new Error(`Failed to send data: ${(error as Error).message}`);
    }
  }

  async #startReading(): Promise<void> {
    if (!this.#reader) return;

    try {
      while (this.#isConnected) {
        const { value, done } = await this.#reader.read();

        if (done) {
          // Stream ended - this typically means the port was closed
          if (this.#isConnected) {
            console.log("SerialManager: Read stream ended unexpectedly");
            await this.#handleUnexpectedDisconnect("Port read stream ended");
          }
          break;
        }

        if (value) {
          this.emit("data", value);
        }
      }
    } catch (error) {
      if (this.#isConnected) {
        console.log("SerialManager: Read error while connected", error);

        // Check if this looks like a disconnect error
        const errorMessage = (error as Error).message.toLowerCase();
        if (
          errorMessage.includes("device") ||
          errorMessage.includes("port") ||
          errorMessage.includes("connection") ||
          errorMessage.includes("network") ||
          errorMessage.includes("disconnected")
        ) {
          await this.#handleUnexpectedDisconnect((error as Error).message);
        } else {
          this.emit(
            "error",
            new Error(`Data receive error: ${(error as Error).message}`),
          );
        }
      }
    }
  }

  async #handleUnexpectedDisconnect(reason: string): Promise<void> {
    console.log("SerialManager: Handling unexpected disconnect:", reason);

    // Clean up resources without emitting 'disconnected' event
    this.#isConnected = false;

    // Clean up reader
    if (this.#reader) {
      try {
        this.#reader.releaseLock();
      } catch (error) {
        console.log(
          "SerialManager: Error releasing reader lock during unexpected disconnect",
          error,
        );
      }
      this.#reader = null;
    }

    // Clean up writer
    if (this.#writer) {
      try {
        await this.#writer.close();
      } catch (error) {
        console.log(
          "SerialManager: Error closing writer during unexpected disconnect",
          error,
        );
      }
      this.#writer = null;
    }

    // Emit the specific port disconnected event
    this.emit("portDisconnected");
  }

  /** Whether the manager currently considers the port connected. */
  get connected(): boolean {
    return this.#isConnected;
  }

  /** Attempt to reconnect using the existing port and provided config. */
  async reconnect(config: SerialConfig): Promise<void> {
    console.log("SerialManager: attempting reconnection");

    // If already connected, disconnect first
    if (this.#isConnected) {
      await this.disconnect();
    }

    // Attempt to reconnect using the same port if available
    if (this.#port) {
      try {
        await this.connect(config);
      } catch (error) {
        // If reconnection with existing port fails, clear the port reference
        console.log(
          "SerialManager: Reconnection with existing port failed, clearing port reference",
        );
        this.#port = null;
        throw error;
      }
    } else {
      throw new Error(
        "No port available for reconnection. Please select a port first.",
      );
    }
  }
}
