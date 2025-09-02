import { render } from "preact";
import { App } from "./App.tsx";

const appElement = document.getElementById("app");
if (appElement) {
  render(<App />, appElement);
}
