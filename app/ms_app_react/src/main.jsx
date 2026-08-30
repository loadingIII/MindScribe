import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppStore } from "./store/AppStore";
import { installAuthFetch } from "./auth";
import "./styles.css";

installAuthFetch();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AppStore>
        <App />
      </AppStore>
    </BrowserRouter>
  </StrictMode>
);
