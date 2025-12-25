import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n/i18n";
import App from "./App.tsx";
import "./index.css";

// Set Google Maps API key for dynamic loading in index.html
declare global {
  interface Window {
    __GOOGLE_MAPS_API_KEY__: string;
  }
}
window.__GOOGLE_MAPS_API_KEY__ = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
