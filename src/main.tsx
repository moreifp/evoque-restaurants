import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n/i18n";
import App from "./App.tsx";
import "./index.css";

// Set Google Maps API key for dynamic loading in index.html
declare global {
  interface Window {
    __GOOGLE_MAPS_API_KEY__: string;
    __loadGoogleMaps?: (apiKey?: string) => void;
    __googleMapsLoaded?: boolean;
  }
}

// Load Google Maps with API key from environment
function loadGoogleMaps() {
  // Try to get API key from Vite environment variable
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  if (apiKey && window.__loadGoogleMaps) {
    console.log('[Main] Loading Google Maps with VITE_GOOGLE_MAPS_API_KEY');
    window.__loadGoogleMaps(apiKey);
  } else if (!apiKey) {
    console.warn('[Main] VITE_GOOGLE_MAPS_API_KEY not found in environment');
  }
}

// Initialize Google Maps
loadGoogleMaps();

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
