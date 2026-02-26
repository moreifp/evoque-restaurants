
-- Add AI consent columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_consent_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS ai_consent_version text DEFAULT '2026-02-26',
  ADD COLUMN IF NOT EXISTS ai_consent_scopes text[] DEFAULT '{}';

-- Create ai_consent_logs table
CREATE TABLE public.ai_consent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL,
  allowed boolean NOT NULL,
  policy_version text NOT NULL DEFAULT '2026-02-26',
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_consent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own consent logs"
  ON public.ai_consent_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own consent logs"
  ON public.ai_consent_logs FOR SELECT
  USING (auth.uid() = user_id);
