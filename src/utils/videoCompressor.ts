/**
 * Video Compression Utility
 * Uses browser-native APIs (canvas + MediaRecorder) to compress videos before upload
 */

export interface CompressionProgress {
  stage: 'loading' | 'compressing' | 'finalizing';
  progress: number; // 0-100
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

// Compression settings based on target quality
const COMPRESSION_SETTINGS = {
  maxWidth: 1280,      // Max video width
  maxHeight: 720,      // Max video height (720p)
  videoBitrate: 2_000_000, // 2 Mbps for good quality
  audioBitrate: 128_000,   // 128 kbps for audio
  frameRate: 30,
};

/**
 * Check if video compression is supported in this browser
 */
export const isCompressionSupported = (): boolean => {
  return !!(
    typeof MediaRecorder !== 'undefined' &&
    document.createElement('canvas').getContext('2d') &&
    document.createElement('video')
  );
};

/**
 * Calculate target dimensions while maintaining aspect ratio
 */
const calculateTargetDimensions = (
  videoWidth: number,
  videoHeight: number
): { width: number; height: number } => {
  const { maxWidth, maxHeight } = COMPRESSION_SETTINGS;
  
  // If video is already smaller, keep original dimensions
  if (videoWidth <= maxWidth && videoHeight <= maxHeight) {
    return { width: videoWidth, height: videoHeight };
  }
  
  const aspectRatio = videoWidth / videoHeight;
  
  if (videoWidth > videoHeight) {
    // Landscape
    const width = Math.min(videoWidth, maxWidth);
    const height = Math.round(width / aspectRatio);
    return { width, height: Math.min(height, maxHeight) };
  } else {
    // Portrait or square
    const height = Math.min(videoHeight, maxHeight);
    const width = Math.round(height * aspectRatio);
    return { width: Math.min(width, maxWidth), height };
  }
};

/**
 * Get the best supported video MIME type
 */
const getSupportedMimeType = (): string => {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  
  return 'video/webm'; // Fallback
};

/**
 * Compress a video file
 */
export const compressVideo = async (
  file: File,
  onProgress?: (progress: CompressionProgress) => void
): Promise<CompressionResult> => {
  const originalSize = file.size;
  
  // Skip compression for small videos (under 5MB)
  if (originalSize < 5 * 1024 * 1024) {
    return {
      blob: file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
    };
  }
  
  onProgress?.({ stage: 'loading', progress: 0 });
  
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    
    video.onloadedmetadata = async () => {
      try {
        const { width, height } = calculateTargetDimensions(
          video.videoWidth,
          video.videoHeight
        );
        
        onProgress?.({ stage: 'loading', progress: 50 });
        
        // Create canvas for video rendering
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        
        // Create MediaRecorder with the canvas stream
        const stream = canvas.captureStream(COMPRESSION_SETTINGS.frameRate);
        
        // Try to capture audio if present
        try {
          // We can't easily extract audio, so we'll proceed without it
          // In a real implementation, you'd use Web Audio API
        } catch {
          // Audio capture not supported, continue without audio
        }
        
        const mimeType = getSupportedMimeType();
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: COMPRESSION_SETTINGS.videoBitrate,
        });
        
        const chunks: Blob[] = [];
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        
        mediaRecorder.onstop = () => {
          URL.revokeObjectURL(objectUrl);
          
          const compressedBlob = new Blob(chunks, { type: mimeType });
          const compressedSize = compressedBlob.size;
          
          // If compression made file larger, return original
          if (compressedSize >= originalSize) {
            resolve({
              blob: file,
              originalSize,
              compressedSize: originalSize,
              compressionRatio: 1,
            });
            return;
          }
          
          onProgress?.({ stage: 'finalizing', progress: 100 });
          
          resolve({
            blob: compressedBlob,
            originalSize,
            compressedSize,
            compressionRatio: originalSize / compressedSize,
          });
        };
        
        mediaRecorder.onerror = (e) => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('MediaRecorder error: ' + e));
        };
        
        // Start recording
        mediaRecorder.start(100); // Collect data every 100ms
        onProgress?.({ stage: 'compressing', progress: 0 });
        
        // Play video and draw to canvas
        video.currentTime = 0;
        await video.play();
        
        const duration = video.duration;
        let lastProgressUpdate = 0;
        
        const drawFrame = () => {
          if (video.paused || video.ended) {
            mediaRecorder.stop();
            return;
          }
          
          ctx.drawImage(video, 0, 0, width, height);
          
          // Update progress
          const currentProgress = Math.round((video.currentTime / duration) * 100);
          if (currentProgress !== lastProgressUpdate) {
            lastProgressUpdate = currentProgress;
            onProgress?.({ stage: 'compressing', progress: currentProgress });
          }
          
          requestAnimationFrame(drawFrame);
        };
        
        video.onended = () => {
          mediaRecorder.stop();
        };
        
        drawFrame();
        
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load video'));
    };
    
    video.load();
  });
};

/**
 * Compress video with fallback - returns original if compression fails
 */
export const compressVideoSafe = async (
  file: File,
  onProgress?: (progress: CompressionProgress) => void
): Promise<{ file: File; wasCompressed: boolean; stats?: CompressionResult }> => {
  // Check if compression is supported
  if (!isCompressionSupported()) {
    console.log('Video compression not supported in this browser');
    return { file, wasCompressed: false };
  }
  
  // Only compress video files
  if (!file.type.startsWith('video/')) {
    return { file, wasCompressed: false };
  }
  
  try {
    const result = await compressVideo(file, onProgress);
    
    // Create a new File object from the blob
    const extension = result.blob.type.includes('webm') ? 'webm' : 'mp4';
    const compressedFile = new File(
      [result.blob],
      file.name.replace(/\.[^.]+$/, `.${extension}`),
      { type: result.blob.type }
    );
    
    return {
      file: compressedFile,
      wasCompressed: result.compressionRatio > 1,
      stats: result,
    };
  } catch (error) {
    console.error('Video compression failed, using original:', error);
    return { file, wasCompressed: false };
  }
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
