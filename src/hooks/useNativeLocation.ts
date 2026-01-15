import { useCallback, useState, useRef } from 'react';
import { useDespia } from '@/contexts/DespiaContext';
import type { LocationOptions, LocationResult, GeofenceOptions } from './useDespiaNative';

interface LocationState {
  position: LocationResult | null;
  error: string | null;
  loading: boolean;
}

export function useNativeLocation() {
  const { isNative, despia, hasLocation } = useDespia();
  const [state, setState] = useState<LocationState>({
    position: null,
    error: null,
    loading: false,
  });
  const watchIdRef = useRef<string | null>(null);

  // Get current position using native GPS (with fallback to web)
  const getCurrentPosition = useCallback(async (options?: LocationOptions): Promise<LocationResult | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    // Use native location if available
    if (isNative && despia && hasLocation) {
      try {
        const position = await despia.location.getCurrentPosition({
          enableHighAccuracy: options?.enableHighAccuracy ?? true,
          timeout: options?.timeout || 15000,
          maximumAge: options?.maximumAge || 0,
        });

        setState({ position, error: null, loading: false });
        console.log('[NativeLocation] Native position:', position);
        return position;
      } catch (error) {
        console.error('[NativeLocation] Native error:', error);
        setState(prev => ({ ...prev, error: 'Failed to get location', loading: false }));
        return null;
      }
    }

    // Fallback to web geolocation (for PWA)
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setState({ position: null, error: 'Geolocation not supported', loading: false });
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const position: LocationResult = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude ?? undefined,
            speed: pos.coords.speed ?? undefined,
            heading: pos.coords.heading ?? undefined,
            timestamp: pos.timestamp,
          };
          setState({ position, error: null, loading: false });
          console.log('[NativeLocation] Web position:', position);
          resolve(position);
        },
        (error) => {
          console.error('[NativeLocation] Web error:', error);
          setState({ position: null, error: error.message, loading: false });
          resolve(null);
        },
        {
          enableHighAccuracy: options?.enableHighAccuracy ?? true,
          timeout: options?.timeout || 15000,
          maximumAge: options?.maximumAge || 0,
        }
      );
    });
  }, [isNative, despia, hasLocation]);

  // Watch position (native only - for background tracking)
  const watchPosition = useCallback((
    callback: (position: LocationResult) => void,
    options?: { background?: boolean; distanceFilter?: number }
  ): (() => void) => {
    // Only use native watch for background tracking
    if (isNative && despia && hasLocation && options?.background) {
      try {
        const watchId = despia.location.watchPosition(callback, {
          enableHighAccuracy: true,
          background: options.background,
          distanceFilter: options.distanceFilter || 10,
        });
        
        watchIdRef.current = watchId;
        console.log('[NativeLocation] Started native watch:', watchId);

        return () => {
          if (watchIdRef.current) {
            despia.location.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
            console.log('[NativeLocation] Stopped native watch');
          }
        };
      } catch (error) {
        console.error('[NativeLocation] Error starting watch:', error);
        return () => {};
      }
    }

    // Fallback to web geolocation (foreground only)
    if (navigator.geolocation) {
      const webWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          callback({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude ?? undefined,
            speed: pos.coords.speed ?? undefined,
            heading: pos.coords.heading ?? undefined,
            timestamp: pos.timestamp,
          });
        },
        (error) => {
          console.error('[NativeLocation] Web watch error:', error);
        },
        {
          enableHighAccuracy: true,
        }
      );

      return () => {
        navigator.geolocation.clearWatch(webWatchId);
      };
    }

    return () => {};
  }, [isNative, despia, hasLocation]);

  // Add geofence for a location (native only)
  const addGeofence = useCallback(async (options: GeofenceOptions): Promise<string | null> => {
    if (!isNative || !despia || !hasLocation) {
      return null;
    }

    try {
      const geofenceId = await despia.location.addGeofence(options);
      console.log('[NativeLocation] Added geofence:', geofenceId);
      return geofenceId;
    } catch (error) {
      console.error('[NativeLocation] Error adding geofence:', error);
      return null;
    }
  }, [isNative, despia, hasLocation]);

  // Remove a geofence (native only)
  const removeGeofence = useCallback(async (geofenceId: string): Promise<void> => {
    if (!isNative || !despia || !hasLocation) {
      return;
    }

    try {
      await despia.location.removeGeofence(geofenceId);
      console.log('[NativeLocation] Removed geofence:', geofenceId);
    } catch (error) {
      console.error('[NativeLocation] Error removing geofence:', error);
    }
  }, [isNative, despia, hasLocation]);

  return {
    isNativeAvailable: isNative && hasLocation,
    ...state,
    getCurrentPosition,
    watchPosition,
    addGeofence,
    removeGeofence,
  };
}
