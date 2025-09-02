/**
 * Utility helpers to convert transport events into async iterables.
 *
 * Keeps concerns (stream acquisition) separate from protocol-specific
 * framing logic implemented inside RTU / ASCII send helpers.
 */
import { createErr, createOk, type Result } from "option-t/plain_result";
import type { IModbusTransport } from "./transport/transport.ts";

/** Result emitted by the byte stream when a terminal condition happens. */
export interface StreamTermination {
  /** Optional error that caused termination. */
  error?: Error;
  /** True when transport closed normally (no error). */
  closed: boolean;
  /** True when aborted via AbortSignal. */
  aborted: boolean;
}

/**
 * Convert a Modbus transport (EventTarget emitting Uint8Array through `message` events)
 * into an async iterable of raw Uint8Array chunks.
 *
 * The iterable completes when:
 *  - AbortSignal aborts
 *  - An `error` event fires (iterator throws)
 *  - A `close` event fires (normal completion)
 */
export async function* byteStreamFromTransport(
  transport: IModbusTransport,
  options: { signal?: AbortSignal } = {},
): AsyncGenerator<Uint8Array, void, unknown> {
  const { signal } = options;
  const queue: (Uint8Array | null)[] = [];
  let resolve: (() => void) | undefined;
  let done = false;
  let error: Error | undefined;

  const wake = () => {
    if (resolve) {
      const r = resolve;
      resolve = undefined;
      r();
    }
  };

  const onMessage = (ev: Event) => {
    const data = (ev as CustomEvent<Uint8Array>).detail;
    if (data instanceof Uint8Array) {
      queue.push(data);
      wake();
    }
  };
  const onError = (ev: Event) => {
    if (!done) {
      const ce = ev as CustomEvent<Error> & { error?: unknown };
      const possible = ce.detail ?? ce.error;
      error =
        possible instanceof Error
          ? possible
          : new Error(String(possible ?? "Unknown error"));
      done = true;
      queue.push(null);
      wake();
    }
  };
  const onClose = () => {
    if (!done) {
      done = true;
      queue.push(null);
      wake();
    }
  };
  const onAbort = () => {
    if (!done) {
      done = true;
      error =
        signal?.reason instanceof Error ? signal.reason : new Error("Aborted");
      queue.push(null);
      wake();
    }
  };

  transport.addEventListener("message", onMessage, { signal });
  transport.addEventListener("error", onError, { signal });
  transport.addEventListener("close", onClose, { signal });
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (!queue.length) {
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
      const item = queue.shift();
      if (item === null) break;
      if (item) yield item;
    }
    if (error) {
      throw error;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Convenience helper that reads the first chunk (mainly for tests). */
export async function readOneChunk(
  transport: IModbusTransport,
  options: { signal?: AbortSignal } = {},
): Promise<Result<Uint8Array, Error>> {
  try {
    for await (const chunk of byteStreamFromTransport(transport, options)) {
      return createOk(chunk);
    }
    return createErr(new Error("Stream ended without data"));
  } catch (e) {
    return createErr(e as Error);
  }
}
