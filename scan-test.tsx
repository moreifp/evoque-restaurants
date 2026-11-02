import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/i18n/i18n";
import { QrScanner } from "@/components/camera/QrScanner";
import "./src/index.css";
const t0 = performance.now();
createRoot(document.getElementById("r")!).render(
  <I18nProvider>
    <QrScanner open onClose={() => {}} onResult={(text, frame) => { (window as any).__res = { text, frame: frame?.size ?? 0, ms: Math.round(performance.now() - t0) }; }} />
  </I18nProvider>,
);
