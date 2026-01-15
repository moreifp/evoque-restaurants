-- Create push_tokens table for storing FCM/APNs tokens (iOS native only)
CREATE TABLE public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Enable RLS on push_tokens
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies for push_tokens
CREATE POLICY "Users can view their own push tokens"
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push tokens"
  ON public.push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push tokens"
  ON public.push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push tokens"
  ON public.push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Add biometric_enabled column to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN DEFAULT false;

-- Add notification_preferences column to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';

-- Add local_notification_id column to scheduled_visits
ALTER TABLE public.scheduled_visits 
  ADD COLUMN IF NOT EXISTS local_notification_id TEXT;