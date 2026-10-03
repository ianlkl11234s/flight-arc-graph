import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/ui.css";
import { setBootAttr } from "./components/boot/bootSequence";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

// 開場雷達期間主畫面元件先藏在邊界外，就緒後彈入（spec「開場（Boot）」）
setBootAttr("wait");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
