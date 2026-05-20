import React from "react";
import { createRoot } from "react-dom/client";
import App from "../volantinipro-final.jsx";
import { warnIfMojibake } from "./lib/mojibakeGuard.js";

warnIfMojibake(document.documentElement?.innerHTML || "", "initial document");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
