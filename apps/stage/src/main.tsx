import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const showcase = new URLSearchParams(globalThis.location?.search ?? "").get("showcase");
const Root = showcase === "you-and-aizu"
  ? (await import("./showcase/YouAndAizuShowcase")).default
  : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
