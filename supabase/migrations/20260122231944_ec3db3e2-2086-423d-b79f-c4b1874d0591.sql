-- Create table for logging upload errors
CREATE TABLE public.upload_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Error context
  error_type TEXT NOT NULL, -- 'upload_failed', 'network_error', 'timeout', 'auth_error', etc.
  error_message TEXT,
  error_code TEXT,
  
  -- File context
  file_name TEXT,
  file_size BIGINT,
  file_type TEXT,
  category TEXT, -- 'place', 'food', 'wine', etc.
  
  -- Device/Network context
  platform TEXT, -- 'ios', 'android', 'web'
  is_native BOOLEAN DEFAULT false,
  connection_type TEXT, -- 'wifi', '4g', 'offline', etc.
  
  -- Retry context
  attempt_number INTEGER DEFAULT 1,
  was_retry_successful BOOLEAN DEFAULT false,
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE public.upload_error_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own error logs
CREATE POLICY "Users can insert their own error logs" 
ON public.upload_error_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can view their own error logs
CREATE POLICY "Users can view their own error logs" 
ON public.upload_error_logs 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_upload_error_logs_user_created ON public.upload_error_logs(user_id, created_at DESC);
CREATE INDEX idx_upload_error_logs_error_type ON public.upload_error_logs(error_type);

-- Add comment
COMMENT ON TABLE public.upload_error_logs IS 'Logs upload errors for debugging and analysis';