import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDespia } from '@/contexts/DespiaContext';

interface UploadOptions {
  bucket: string;
  filePath: string;
  file: File;
  category: string;
  maxRetries?: number;
  onProgress?: (progress: number) => void;
}

interface UploadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
  attempts: number;
}

interface ErrorLogData {
  error_type: string;
  error_message: string;
  error_code?: string;
  file_name: string;
  file_size: number;
  file_type: string;
  category: string;
  platform: string;
  is_native: boolean;
  connection_type: string;
  attempt_number: number;
  was_retry_successful: boolean;
  metadata?: Record<string, any>;
}

// Get connection type (best effort)
const getConnectionType = (): string => {
  if (!navigator.onLine) return 'offline';
  
  const connection = (navigator as any).connection || 
                     (navigator as any).mozConnection || 
                     (navigator as any).webkitConnection;
  
  if (connection) {
    return connection.effectiveType || connection.type || 'unknown';
  }
  
  return 'unknown';
};

// Classify error type for logging
const classifyError = (error: any): { type: string; code: string } => {
  const message = error?.message?.toLowerCase() || '';
  const statusCode = error?.statusCode || error?.status;
  
  if (!navigator.onLine) {
    return { type: 'network_offline', code: 'OFFLINE' };
  }
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return { type: 'timeout', code: 'TIMEOUT' };
  }
  
  if (message.includes('network') || message.includes('fetch')) {
    return { type: 'network_error', code: 'NETWORK' };
  }
  
  if (message.includes('auth') || message.includes('unauthorized') || statusCode === 401) {
    return { type: 'auth_error', code: 'AUTH' };
  }
  
  if (message.includes('storage') || message.includes('bucket')) {
    return { type: 'storage_error', code: 'STORAGE' };
  }
  
  if (statusCode === 413 || message.includes('too large')) {
    return { type: 'file_too_large', code: 'SIZE' };
  }
  
  if (statusCode >= 500) {
    return { type: 'server_error', code: `HTTP_${statusCode}` };
  }
  
  return { type: 'upload_failed', code: statusCode?.toString() || 'UNKNOWN' };
};

// Exponential backoff delay
const getBackoffDelay = (attempt: number, baseDelay = 1000): number => {
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 500;
  return Math.min(baseDelay * Math.pow(2, attempt - 1) + jitter, 10000);
};

// Sleep function
const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

export function useUploadWithRetry() {
  const [isUploading, setIsUploading] = useState(false);
  const { isNative, platform } = useDespia();

  // Log error to database
  const logUploadError = useCallback(async (data: ErrorLogData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[UploadRetry] Cannot log error: not authenticated');
        return;
      }

      const { error } = await supabase
        .from('upload_error_logs')
        .insert({
          user_id: user.id,
          ...data,
        });

      if (error) {
        console.error('[UploadRetry] Failed to log error:', error);
      } else {
        console.log('[UploadRetry] Error logged successfully:', data.error_type);
      }
    } catch (e) {
      console.error('[UploadRetry] Exception logging error:', e);
    }
  }, []);

  // Upload with retry logic
  const uploadWithRetry = useCallback(async ({
    bucket,
    filePath,
    file,
    category,
    maxRetries = 3,
    onProgress,
  }: UploadOptions): Promise<UploadResult> => {
    setIsUploading(true);
    
    let lastError: any = null;
    let attempt = 0;
    
    const connectionType = getConnectionType();
    const platformStr = platform || 'web';
    
    console.log('[UploadRetry] Starting upload:', {
      fileName: file.name,
      fileSize: file.size,
      category,
      platform: platformStr,
      isNative,
      connectionType,
    });

    while (attempt < maxRetries) {
      attempt++;
      
      try {
        console.log(`[UploadRetry] Attempt ${attempt}/${maxRetries} for ${file.name}`);
        
        // Check connectivity before attempting
        if (!navigator.onLine) {
          throw new Error('Device is offline. Please check your internet connection.');
        }
        
        // Simulate progress (Supabase doesn't provide real progress yet)
        onProgress?.(10);
        
        const { data, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          });
        
        onProgress?.(80);
        
        if (uploadError) {
          throw uploadError;
        }
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);
        
        onProgress?.(100);
        
        console.log(`[UploadRetry] Upload succeeded on attempt ${attempt}`);
        
        // If this was a retry that succeeded, log it
        if (attempt > 1 && lastError) {
          const { type, code } = classifyError(lastError);
          await logUploadError({
            error_type: type,
            error_message: lastError.message || 'Unknown error',
            error_code: code,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            category,
            platform: platformStr,
            is_native: isNative,
            connection_type: connectionType,
            attempt_number: attempt - 1, // Log the failed attempt
            was_retry_successful: true,
            metadata: { total_attempts: attempt },
          });
        }
        
        setIsUploading(false);
        return {
          success: true,
          publicUrl,
          attempts: attempt,
        };
        
      } catch (error: any) {
        lastError = error;
        console.error(`[UploadRetry] Attempt ${attempt} failed:`, error.message);
        
        // Check if we should retry
        const { type } = classifyError(error);
        const isRetryable = ['network_error', 'timeout', 'server_error', 'network_offline'].includes(type);
        
        if (attempt < maxRetries && isRetryable) {
          const delay = getBackoffDelay(attempt);
          console.log(`[UploadRetry] Retrying in ${Math.round(delay)}ms...`);
          await sleep(delay);
        } else if (!isRetryable) {
          console.log(`[UploadRetry] Error type "${type}" is not retryable`);
          break;
        }
      }
    }
    
    // All retries failed - log the final error
    const { type, code } = classifyError(lastError);
    await logUploadError({
      error_type: type,
      error_message: lastError?.message || 'Unknown error',
      error_code: code,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      category,
      platform: platformStr,
      is_native: isNative,
      connection_type: connectionType,
      attempt_number: attempt,
      was_retry_successful: false,
      metadata: { 
        total_attempts: attempt,
        final_error: lastError?.message,
      },
    });
    
    setIsUploading(false);
    return {
      success: false,
      error: lastError?.message || 'Upload failed after multiple attempts',
      attempts: attempt,
    };
  }, [isNative, platform, logUploadError]);

  // Batch upload multiple files with retry
  const uploadBatchWithRetry = useCallback(async (
    files: Array<{ file: File; filePath: string; category: string }>,
    bucket: string,
    onFileProgress?: (fileIndex: number, progress: number) => void,
  ): Promise<Array<UploadResult & { fileIndex: number }>> => {
    const results: Array<UploadResult & { fileIndex: number }> = [];
    
    for (let i = 0; i < files.length; i++) {
      const { file, filePath, category } = files[i];
      
      const result = await uploadWithRetry({
        bucket,
        filePath,
        file,
        category,
        onProgress: (progress) => onFileProgress?.(i, progress),
      });
      
      results.push({ ...result, fileIndex: i });
    }
    
    return results;
  }, [uploadWithRetry]);

  return {
    isUploading,
    uploadWithRetry,
    uploadBatchWithRetry,
    logUploadError,
  };
}

export type { UploadOptions, UploadResult, ErrorLogData };
