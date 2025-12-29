import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n/i18n";
import App from "./App.tsx";
import "./index.css";

// Set Google Maps API key for dynamic loading in index.html
declare global {
  interface Window {
    __GOOGLE_MAPS_API_KEY__: string;
    __loadGoogleMaps?: () => void;
    __googleMapsLoaded?: boolean;
  }
}

// Fetch Google Maps API key from edge function
async function initGoogleMaps() {
  try {
    const response = await fetch(
      'https://ljrtilsqwzebnbizmvis.supabase.co/functions/v1/get-google-maps-key'
    );
    
    if (!response.ok) {
      console.error('Failed to fetch Google Maps API key');
      return;
    }
    
    const data = await response.json();
    
    if (data.apiKey) {
      window.__GOOGLE_MAPS_API_KEY__ = data.apiKey;
      console.log('Google Maps API key loaded successfully');
      
      // Load Google Maps now that the API key is set
      if (window.__loadGoogleMaps) {
        window.__loadGoogleMaps();
      }
    } else {
      console.error('No API key in response');
    }
  } catch (error) {
    console.error('Error fetching Google Maps API key:', error);
  }
}

// Initialize Google Maps API key
initGoogleMaps();

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
