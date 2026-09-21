import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./styles.css";

const wurzel = document.getElementById("root");
if (!wurzel) {
  throw new Error("Element #root fehlt in index.html.");
}

createRoot(wurzel).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
