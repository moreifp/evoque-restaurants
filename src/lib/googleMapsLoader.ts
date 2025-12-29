// Unified Google Maps loader - single source of truth
// Fetches API key from backend and handles all loading states

import { supabase } from "@/integrations/supabase/client";

type LoaderState = {
  promise: Promise<void> | null;
  loaded: boolean;
  error: string | null;
};

const state: LoaderState = {
  promise: null,
  loaded: false,
  error: null,
};

// Check if Google Maps is fully ready (Map + Places)
export function isGoogleMapsReady(): boolean {
  const google = (window as any).google;
  return !!(google?.maps?.Map && google?.maps?.places);
}

// Get last error
export function getGoogleMapsError(): string | null {
  return state.error;
}

// Reset loader state (for retry)
export function resetGoogleMapsLoader(): void {
  state.promise = null;
  state.loaded = false;
  state.error = null;
  
  // Remove existing script
  const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
  if (existingScript) {
    existingScript.remove();
  }
  
  // Reset global flags
  (window as any).__googleMapsLoaded = false;
  
  // Clear PWA cache for Google Maps
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        if (name.includes('google') || name.includes('maps')) {
          caches.delete(name);
          console.log('[GoogleMapsLoader] Cleared cache:', name);
        }
      });
    });
  }
}

// Main loader function
export function loadGoogleMaps(): Promise<void> {
  // Already loaded
  if (isGoogleMapsReady()) {
    console.log('[GoogleMapsLoader] Already ready');
    return Promise.resolve();
  }
  
  // Already loading
  if (state.promise) {
    console.log('[GoogleMapsLoader] Already loading, reusing promise');
    return state.promise;
  }
  
  console.log('[GoogleMapsLoader] Starting load...');
  
  state.promise = new Promise<void>(async (resolve, reject) => {
    try {
      // Fetch API key from backend
      console.log('[GoogleMapsLoader] Fetching API key from backend...');
      const { data, error } = await supabase.functions.invoke('get-google-maps-key');
      
      if (error || !data?.apiKey) {
        const errorMsg = error?.message || 'Failed to get API key';
        console.error('[GoogleMapsLoader] Backend error:', errorMsg);
        state.error = errorMsg;
        reject(new Error(errorMsg));
        return;
      }
      
      const apiKey = data.apiKey;
      console.log('[GoogleMapsLoader] Got API key, injecting script...');
      
      // Setup auth failure handler
      (window as any).gm_authFailure = () => {
        const errorMsg = 'API key error: check billing, enabled APIs, or domain restrictions';
        console.error('[GoogleMapsLoader] Auth failure:', errorMsg);
        state.error = errorMsg;
        reject(new Error(errorMsg));
      };
      
      // Setup callback
      (window as any).initGoogleMaps = () => {
        console.log('[GoogleMapsLoader] Callback fired');
        
        // Verify both Map and Places are available
        const google = (window as any).google;
        if (google?.maps?.Map && google?.maps?.places) {
          console.log('[GoogleMapsLoader] Map and Places ready');
          state.loaded = true;
          state.error = null;
          window.dispatchEvent(new Event('google-maps-loaded'));
          resolve();
        } else {
          const errorMsg = 'Google Maps loaded but Places API not available';
          console.error('[GoogleMapsLoader]', errorMsg);
          state.error = errorMsg;
          reject(new Error(errorMsg));
        }
      };
      
      // Remove existing script
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        existingScript.remove();
      }
      
      // Create and inject script with cache buster
      const script = document.createElement('script');
      const cacheBuster = Date.now();
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps&v=weekly&_cb=${cacheBuster}`;
      script.async = true;
      script.defer = true;
      
      script.onerror = () => {
        const errorMsg = 'Failed to load Google Maps script (network or blocked)';
        console.error('[GoogleMapsLoader]', errorMsg);
        state.error = errorMsg;
        state.promise = null;
        reject(new Error(errorMsg));
      };
      
      document.body.appendChild(script);
      console.log('[GoogleMapsLoader] Script injected');
      
      // Timeout after 20 seconds
      setTimeout(() => {
        if (!state.loaded) {
          const errorMsg = 'Timeout loading Google Maps';
          console.error('[GoogleMapsLoader]', errorMsg);
          state.error = errorMsg;
          state.promise = null;
          reject(new Error(errorMsg));
        }
      }, 20000);
      
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown error loading Google Maps';
      console.error('[GoogleMapsLoader] Error:', errorMsg);
      state.error = errorMsg;
      state.promise = null;
      reject(err);
    }
  });
  
  return state.promise;
}
