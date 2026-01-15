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
    console.log('[NativeCamera] Converting media to file:', { 
      uri: media.uri?.substring(0, 100), 
      type: media.type, 
      name: media.name 
    });

    try {
      // Attempt to fetch the URI
      const response = await fetch(media.uri);
      
      if (!response.ok) {
        console.error('[NativeCamera] Fetch failed with status:', response.status, response.statusText);
        return null;
      }

      const blob = await response.blob();
      
      // Validate blob
      if (!blob || blob.size === 0) {
        console.error('[NativeCamera] Blob is empty or invalid:', { size: blob?.size, type: blob?.type });
        return null;
      }

      console.log('[NativeCamera] Blob received:', { size: blob.size, type: blob.type });
      
      // Determine MIME type - prioritize explicit type, fallback to blob, then infer from extension
      let mimeType = blob.type;
      if (!mimeType || mimeType === 'application/octet-stream' || mimeType === '') {
        // Infer from media type or filename extension
        const ext = media.name?.toLowerCase().split('.').pop() || '';
        if (media.type === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) {
          mimeType = ext === 'png' ? 'image/png' : 
                     ext === 'gif' ? 'image/gif' : 
                     ext === 'webp' ? 'image/webp' : 
                     ext === 'heic' ? 'image/heic' :
                     'image/jpeg';
        } else if (media.type === 'video' || ['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
          mimeType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
        } else {
          // Default to jpeg for images if we can't determine
          mimeType = media.type === 'video' ? 'video/mp4' : 'image/jpeg';
        }
        console.log('[NativeCamera] Inferred MIME type:', mimeType);
      }
      
      // Ensure filename has proper extension
      let fileName = media.name || `media_${Date.now()}`;
      if (!fileName.includes('.')) {
        const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') || 'jpg';
        fileName = `${fileName}.${ext}`;
      }
      
      const file = new File([blob], fileName, { type: mimeType });
      
      // Final validation
      if (file.size === 0) {
        console.error('[NativeCamera] File is empty after creation');
        return null;
      }

      console.log('[NativeCamera] Created file successfully:', { name: file.name, type: file.type, size: file.size });
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
