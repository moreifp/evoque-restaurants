import { useCallback } from 'react';
import type { CameraOptions, CameraResult, MediaPickerOptions, MediaResult } from './useDespiaNative';

/**
 * Native Camera Hook
 * 
 * IMPORTANT: The Despia SDK does NOT expose camera or gallery APIs.
 * This hook is kept for backward compatibility but always returns isAvailable: false.
 * 
 * For camera/gallery access in Despia WebView, use standard web APIs:
 * - Camera: <input type="file" accept="image/*" capture="environment">
 * - Gallery: <input type="file" accept="image/*" multiple>
 * 
 * These work natively in iOS WebView and are the recommended approach.
 */
export function useNativeCamera() {
  // Always return unavailable - Despia doesn't have native camera API
  const isAvailable = false;

  // Stub functions that return null/empty - kept for backward compatibility
  const takePicture = useCallback(async (_options?: CameraOptions): Promise<CameraResult | null> => {
    console.warn('[NativeCamera] Native camera API not available in Despia. Use web input with capture attribute.');
    return null;
  }, []);

  const recordVideo = useCallback(async (_maxDuration?: number): Promise<{ uri: string; duration: number } | null> => {
    console.warn('[NativeCamera] Native video API not available in Despia. Use web input.');
    return null;
  }, []);

  const pickImages = useCallback(async (_options?: MediaPickerOptions): Promise<MediaResult[]> => {
    console.warn('[NativeCamera] Native gallery API not available in Despia. Use web input.');
    return [];
  }, []);

  const pickVideos = useCallback(async (_options?: MediaPickerOptions): Promise<MediaResult[]> => {
    console.warn('[NativeCamera] Native video picker not available in Despia. Use web input.');
    return [];
  }, []);

  const mediaResultToFile = useCallback(async (_media: MediaResult): Promise<File | null> => {
    console.warn('[NativeCamera] Media conversion not needed - use web File API directly.');
    return null;
  }, []);

  return {
    isAvailable,
    takePicture,
    recordVideo,
    pickImages,
    pickVideos,
    mediaResultToFile,
  };
}
