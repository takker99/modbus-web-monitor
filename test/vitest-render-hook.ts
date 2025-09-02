/** @jsxImportSource preact */
import { h, render } from "preact";
import { act } from "preact/test-utils";

// no state needed

interface HookResult<T> {
  result: { current: T };
  unmount: () => void;
}

export function renderHook<T>(fn: () => T): HookResult<T> {
  const container = document.createElement("div");
  if (typeof document !== "undefined") {
    document.body.appendChild(container);
  }
  const state: { current: T | null } = { current: null };
  const HookWrapper = () => {
    state.current = fn();
    return null;
  };
  act(() => {
    render(h(HookWrapper, {}), container);
  });
  return {
    result: {
      get current() {
        return state.current as T;
      },
    },
    unmount: () => {
      container.remove();
    },
  } as HookResult<T>;
}

export { act };
