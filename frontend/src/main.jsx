import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import "@fontsource-variable/manrope/wght.css";
import "./arena-v2.css";
import "./design/nocturne.css";
import "./environment2d/environment2d.css";
import "./practice-workspace.css";
import "./design/site-polish.css";
import "./design/form-controls.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
