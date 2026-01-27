import { useState, useEffect } from 'react';

// Type definitions for Despia SDK
declare global {
  interface Window {
    despia?: DespiaSDK;
  }
}

interface DespiaSDK {
  isNative: () => boolean;
  getPlatform: () => 'ios' | 'android' | 'web';
  notifications: {
    requestPermission: () => Promise<boolean>;
    scheduleLocal: (options: LocalNotificationOptions) => Promise<string>;
    cancelLocal: (id: string) => Promise<void>;
    getToken: () => Promise<string>;
  };
  camera: {
    takePicture: (options?: CameraOptions) => Promise<CameraResult>;
    recordVideo: (options?: VideoOptions) => Promise<VideoResult>;
  };
  media: {
    pickImages: (options?: MediaPickerOptions) => Promise<MediaResult[]>;
    pickVideos: (options?: MediaPickerOptions) => Promise<MediaResult[]>;
  };
  biometrics: {
    isAvailable: () => Promise<BiometricType>;
    authenticate: (options?: BiometricOptions) => Promise<boolean>;
  };
  location: {
    getCurrentPosition: (options?: LocationOptions) => Promise<LocationResult>;
    watchPosition: (callback: (position: LocationResult) => void, options?: WatchLocationOptions) => string;
    clearWatch: (watchId: string) => void;
    addGeofence: (options: GeofenceOptions) => Promise<string>;
    removeGeofence: (id: string) => Promise<void>;
  };
  secureStorage: {
    set: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | null>;
    remove: (key: string) => Promise<void>;
  };
}

interface LocalNotificationOptions {
  title: string;
  body: string;
  scheduledAt: Date;
  data?: Record<string, unknown>;
  sound?: boolean;
  badge?: number;
}

interface CameraOptions {
  camera?: 'front' | 'back';
  quality?: number;
  flash?: 'auto' | 'on' | 'off';
}

interface CameraResult {
  uri: string;
  base64?: string;
  width: number;
  height: number;
}

interface VideoOptions {
  camera?: 'front' | 'back';
  maxDuration?: number;
  quality?: 'low' | 'medium' | 'high';
}

interface VideoResult {
  uri: string;
  duration: number;
  width: number;
  height: number;
}

interface MediaPickerOptions {
  multiple?: boolean;
  maxCount?: number;
  quality?: number;
  includeBase64?: boolean; // Request base64 data for more reliable iOS gallery uploads
}

interface MediaResult {
  uri: string;
  type: 'image' | 'video';
  name: string;
  size: number;
  base64?: string; // Base64 data if requested and available
}

type BiometricType = 'face' | 'fingerprint' | 'none';

interface BiometricOptions {
  reason?: string;
  fallbackLabel?: string;
}

interface LocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

interface WatchLocationOptions extends LocationOptions {
  background?: boolean;
  distanceFilter?: number;
}

interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
}

interface GeofenceOptions {
  latitude: number;
  longitude: number;
  radius: number;
  identifier: string;
  notifyOnEntry?: boolean;
  notifyOnExit?: boolean;
}

export interface NativeCapabilities {
  isNative: boolean;
  platform: 'ios' | 'android' | 'web';
  hasNotifications: boolean;
  hasCamera: boolean;
  hasBiometrics: boolean;
  hasLocation: boolean;
}

export function useDespiaNative() {
  const [capabilities, setCapabilities] = useState<NativeCapabilities>({
    isNative: false,
    platform: 'web',
    hasNotifications: false,
    hasCamera: false,
    hasBiometrics: false,
    hasLocation: false,
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkNativeCapabilities = async () => {
      // Check if running in Despia WebView via userAgent (official detection method)
      const isDespiaNative = navigator.userAgent.includes('despia');
      
      console.log('[DespiaNative] Environment check:', {
        userAgent: navigator.userAgent,
        isDespia: isDespiaNative,
        platform: /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'other'
      });
      
      if (!isDespiaNative) {
        // Not running in Despia native context - use web fallbacks
        setCapabilities({
          isNative: false,
          platform: 'web',
          hasNotifications: false,
          hasCamera: false,
          hasBiometrics: false,
          hasLocation: false,
        });
        setIsReady(true);
        return;
      }

      // Running in Despia native context
      // IMPORTANT: Despia SDK does NOT expose camera/gallery APIs
      // We must use standard web APIs (input type=file with capture) instead
      // See: https://docs.despia.com - camera/media APIs are NOT documented
      
      // Check biometrics availability via the protocol (bioauth://)
      let hasBiometrics = false;
      try {
        const despia = window.despia;
        if (despia?.biometrics?.isAvailable) {
          const biometricType = await despia.biometrics.isAvailable();
          hasBiometrics = biometricType !== 'none';
        }
      } catch {
        hasBiometrics = false;
      }

      setCapabilities({
        isNative: isDespiaNative,
        platform: 'ios', // Despia currently only supports iOS
        hasNotifications: true,  // Works via OneSignal/registerpush://
        hasCamera: false,        // NOT available - use web input with capture
        hasBiometrics,           // Works via bioauth://
        hasLocation: true,       // Works via standard browser API
      });
      setIsReady(true);
    };

    checkNativeCapabilities();
  }, []);

  return {
    ...capabilities,
    isReady,
    despia: window.despia,
  };
}

export type { 
  DespiaSDK, 
  LocalNotificationOptions, 
  CameraOptions, 
  CameraResult,
  VideoOptions,
  VideoResult,
  MediaPickerOptions,
  MediaResult,
  BiometricType,
  BiometricOptions,
  LocationOptions,
  WatchLocationOptions,
  LocationResult,
  GeofenceOptions,
};
