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

// Global error capture for Google Maps API errors
let lastGoogleError: string | null = null;

// Setup global error listener (call once)
function setupGlobalErrorListener() {
  if ((window as any).__gmErrorListenerSetup) return;
  (window as any).__gmErrorListenerSetup = true;
  
  // Capture console.error calls from Google Maps
  const originalConsoleError = console.error;
  console.error = function(...args: any[]) {
    const msg = args.join(' ');
    if (msg.includes('Google Maps JavaScript API error:') || 
        msg.includes('Google Maps API error:') ||
        msg.includes('InvalidKeyMapError') ||
        msg.includes('RefererNotAllowedMapError') ||
        msg.includes('ApiNotActivatedMapError')) {
      lastGoogleError = msg;
      state.error = msg;
      console.log('[GoogleMapsLoader] Captured API error:', msg);
    }
    originalConsoleError.apply(console, args);
  };
  
  // Also listen for window errors
  window.addEventListener('error', (event) => {
    if (event.message?.includes('google') || event.message?.includes('maps')) {
      lastGoogleError = event.message;
      state.error = event.message;
    }
  });
}

// Check if Google Maps is fully ready (Map + Places)
export function isGoogleMapsReady(): boolean {
  const google = (window as any).google;
  return !!(google?.maps?.Map && google?.maps?.places);
}

// Get last error (from loader or Google API)
export function getGoogleMapsError(): string | null {
  return lastGoogleError || state.error;
}

// Get current origin for debugging domain restrictions
export function getCurrentOrigin(): string {
  return window.location.origin;
}

// Reset loader state (for retry) - more aggressive cleanup
export function resetGoogleMapsLoader(): void {
  state.promise = null;
  state.loaded = false;
  state.error = null;
  lastGoogleError = null;
  
  // Remove existing script
  const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
  if (existingScript) {
    existingScript.remove();
    console.log('[GoogleMapsLoader] Removed existing script');
  }
  
  // Remove all Google Maps related scripts
  document.querySelectorAll('script[src*="googleapis.com"]').forEach(s => {
    s.remove();
    console.log('[GoogleMapsLoader] Removed googleapis script');
  });
  
  // Reset global Google object
  const win = window as any;
  if (win.google?.maps) {
    delete win.google.maps;
    console.log('[GoogleMapsLoader] Deleted google.maps');
  }
  
  // Reset all global flags
  win.__googleMapsLoaded = false;
  delete win.initGoogleMaps;
  delete win.gm_authFailure;
  
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
  // Setup error listener on first call
  setupGlobalErrorListener();
  
  // Already loaded - but verify it's actually working
  if (isGoogleMapsReady() && !lastGoogleError) {
    console.log('[GoogleMapsLoader] Already ready');
    return Promise.resolve();
  }
  
  // If there was an error, don't reuse - force reset
  if (lastGoogleError || state.error) {
    console.log('[GoogleMapsLoader] Previous error detected, resetting...');
    resetGoogleMapsLoader();
  }
  
  // Already loading
  if (state.promise) {
    console.log('[GoogleMapsLoader] Already loading, reusing promise');
    return state.promise;
  }
  
  console.log('[GoogleMapsLoader] Starting load... Origin:', getCurrentOrigin());
  
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
        const errorMsg = `API key rejected. Origin: ${getCurrentOrigin()}. Check billing, enabled APIs (Maps JS + Places), or add this domain to allowed referrers.`;
        console.error('[GoogleMapsLoader] Auth failure:', errorMsg);
        state.error = errorMsg;
        lastGoogleError = errorMsg;
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
          const errorMsg = 'Google Maps loaded but Places API not available. Enable Places API in Google Cloud Console.';
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
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps&v=weekly`;
      script.async = true;
      script.defer = true;
      
      script.onerror = () => {
        const errorMsg = `Failed to load Google Maps script. Origin: ${getCurrentOrigin()}. Check network/ad-blockers.`;
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
          const errorMsg = `Timeout loading Google Maps. Origin: ${getCurrentOrigin()}`;
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
