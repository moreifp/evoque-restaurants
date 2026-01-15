import { useCallback } from 'react';
import { useDespia } from '@/contexts/DespiaContext';
import type { CameraOptions, CameraResult, MediaPickerOptions, MediaResult } from './useDespiaNative';

export function useNativeCamera() {
  const { isNative, despia, hasCamera } = useDespia();

  // Take a photo using native camera
  const takePicture = useCallback(async (options?: CameraOptions): Promise<CameraResult | null> => {
    if (!isNative || !despia || !hasCamera) {
      return null;
    }

    try {
      const result = await despia.camera.takePicture({
        camera: options?.camera || 'back',
        quality: options?.quality || 0.8,
        flash: options?.flash || 'auto',
      });
      
      console.log('[NativeCamera] Photo captured:', result.uri);
      return result;
    } catch (error) {
      console.error('[NativeCamera] Error taking picture:', error);
      return null;
    }
  }, [isNative, despia, hasCamera]);

  // Record a video using native camera
  const recordVideo = useCallback(async (maxDuration?: number): Promise<{ uri: string; duration: number } | null> => {
    if (!isNative || !despia || !hasCamera) {
      return null;
    }

    try {
      const result = await despia.camera.recordVideo({
        camera: 'back',
        maxDuration: maxDuration || 60,
        quality: 'high',
      });
      
      console.log('[NativeCamera] Video recorded:', result.uri);
      return result;
    } catch (error) {
      console.error('[NativeCamera] Error recording video:', error);
      return null;
    }
  }, [isNative, despia, hasCamera]);

  // Pick images from gallery
  const pickImages = useCallback(async (options?: MediaPickerOptions): Promise<MediaResult[]> => {
    if (!isNative || !despia || !hasCamera) {
      return [];
    }

    try {
      const results = await despia.media.pickImages({
        multiple: options?.multiple ?? true,
        maxCount: options?.maxCount || 10,
        quality: options?.quality || 0.8,
      });
      
      console.log('[NativeCamera] Images picked:', results.length);
      return results;
    } catch (error) {
      console.error('[NativeCamera] Error picking images:', error);
      return [];
    }
  }, [isNative, despia, hasCamera]);

  // Pick videos from gallery
  const pickVideos = useCallback(async (options?: MediaPickerOptions): Promise<MediaResult[]> => {
    if (!isNative || !despia || !hasCamera) {
      return [];
    }

    try {
      const results = await despia.media.pickVideos({
        multiple: options?.multiple ?? false,
        maxCount: options?.maxCount || 1,
      });
      
      console.log('[NativeCamera] Videos picked:', results.length);
      return results;
    } catch (error) {
      console.error('[NativeCamera] Error picking videos:', error);
      return [];
    }
  }, [isNative, despia, hasCamera]);

  // Convert native media result to File object for upload
  const mediaResultToFile = useCallback(async (media: MediaResult): Promise<File | null> => {
    try {
      const response = await fetch(media.uri);
      const blob = await response.blob();
      const file = new File([blob], media.name, { type: blob.type });
      return file;
    } catch (error) {
      console.error('[NativeCamera] Error converting media to file:', error);
      return null;
    }
  }, []);

  return {
    isAvailable: isNative && hasCamera,
    takePicture,
    recordVideo,
    pickImages,
    pickVideos,
    mediaResultToFile,
  };
}
