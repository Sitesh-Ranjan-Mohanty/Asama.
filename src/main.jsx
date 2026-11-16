import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

const rootElement = document.querySelector(".app-shell");

if (!rootElement) {
  throw new Error("Unable to start Asama: the app shell element is missing.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
