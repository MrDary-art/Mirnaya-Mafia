import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppearanceProvider } from "./Appearance";
import "./style.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><AppearanceProvider><App/></AppearanceProvider></BrowserRouter></React.StrictMode>);
