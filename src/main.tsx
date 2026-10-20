import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App.tsx";
import "./index.css";
import { preloadBundledPaymentQr } from "@/lib/paymentQr";

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </HelmetProvider>
);

// 首屏渲染后空闲时预热付款页二维码，避免和首屏数据抢带宽
preloadBundledPaymentQr();
