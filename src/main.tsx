import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n/i18n";
import App from "./App.tsx";
import "./index.css";

// Note: Google Maps loading is now handled by src/lib/googleMapsLoader.ts
// Each component that needs Maps will load it on demand

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
