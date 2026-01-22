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
      console.log('[NativeCamera] Calling pickImages with options:', {
        multiple: options?.multiple ?? true,
        maxCount: options?.maxCount || 10,
        quality: options?.quality || 0.8,
        includeBase64: true, // Always request base64 for more reliable iOS uploads
      });
      
      const results = await despia.media.pickImages({
        multiple: options?.multiple ?? true,
        maxCount: options?.maxCount || 10,
        quality: options?.quality || 0.8,
        includeBase64: true, // Request base64 data for reliable conversion
      } as any); // Cast to any since SDK types may not include includeBase64 yet
      
      console.log('[NativeCamera] Images picked:', results.length, 'hasBase64:', results.length > 0 && !!(results[0] as any).base64);
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
    const uriProtocol = media.uri?.split(':')[0] || 'unknown';
    console.log('[NativeCamera] Converting media to file:', { 
      uri: media.uri?.substring(0, 100), 
      uriProtocol,
      type: media.type, 
      name: media.name,
      size: media.size,
      hasBase64: !!(media as any).base64
    });

    // Try base64 first if available (most reliable for iOS)
    if ((media as any).base64) {
      try {
        console.log('[NativeCamera] Using base64 data for conversion');
        const base64Data = (media as any).base64;
        const byteString = atob(base64Data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        
        // Determine MIME type from filename extension
        const ext = media.name?.toLowerCase().split('.').pop() || '';
        const mimeType = ext === 'png' ? 'image/png' : 
                        ext === 'gif' ? 'image/gif' : 
                        ext === 'webp' ? 'image/webp' :
                        ext === 'heic' ? 'image/heic' :
                        'image/jpeg';
        
        let fileName = media.name || `media_${Date.now()}`;
        if (!fileName.includes('.')) {
          fileName = `${fileName}.jpg`;
        }
        
        const blob = new Blob([ab], { type: mimeType });
        const file = new File([blob], fileName, { type: mimeType });
        
        if (file.size > 0) {
          console.log('[NativeCamera] Created file from base64 successfully:', { name: file.name, type: file.type, size: file.size });
          return file;
        }
        console.error('[NativeCamera] Base64 file is empty');
      } catch (base64Error) {
        console.error('[NativeCamera] Base64 conversion failed:', base64Error);
      }
    }

    // Fallback to URI fetch
    try {
      console.log('[NativeCamera] Attempting fetch with URI:', media.uri?.substring(0, 100));
      const response = await fetch(media.uri);
      
      console.log('[NativeCamera] Fetch response:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type')
      });
      
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
      console.error('[NativeCamera] Fetch error details:', {
        error: error,
        message: error instanceof Error ? error.message : String(error),
        uri: media.uri?.substring(0, 100)
      });
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
