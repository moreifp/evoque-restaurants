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
}

interface MediaResult {
  uri: string;
  type: 'image' | 'video';
  name: string;
  size: number;
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
      // Check if Despia SDK is available
      const despia = window.despia;
      
      if (!despia || !despia.isNative()) {
        // Not running in native context - use web fallbacks
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

      // Running in native context - check available features
      const platform = despia.getPlatform();
      
      // Check biometrics availability
      let hasBiometrics = false;
      try {
        const biometricType = await despia.biometrics.isAvailable();
        hasBiometrics = biometricType !== 'none';
      } catch {
        hasBiometrics = false;
      }

      setCapabilities({
        isNative: true,
        platform,
        hasNotifications: true,
        hasCamera: true,
        hasBiometrics,
        hasLocation: true,
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
