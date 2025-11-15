-- Create share_tokens table for short URL sharing
CREATE TABLE public.share_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  entry_id UUID NOT NULL REFERENCES public.restaurant_entries(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  clicks INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT token_length CHECK (length(token) >= 6 AND length(token) <= 8)
);

-- Create index for faster token lookups
CREATE INDEX idx_share_tokens_token ON public.share_tokens(token);
CREATE INDEX idx_share_tokens_entry_id ON public.share_tokens(entry_id);

-- Enable Row Level Security
ALTER TABLE public.share_tokens ENABLE ROW LEVEL SECURITY;

-- Anyone can read tokens (for public access)
CREATE POLICY "Anyone can view share tokens"
ON public.share_tokens
FOR SELECT
USING (true);

-- Only entry owners can create tokens for their entries
CREATE POLICY "Users can create tokens for their own entries"
ON public.share_tokens
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.restaurant_entries
    WHERE id = entry_id AND user_id = auth.uid()
  )
);

-- Only entry owners can delete their tokens
CREATE POLICY "Users can delete tokens for their own entries"
ON public.share_tokens
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_entries
    WHERE id = entry_id AND user_id = auth.uid()
  )
);

-- Only entry owners can update their tokens (for click counting)
CREATE POLICY "Users can update tokens for their own entries"
ON public.share_tokens
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_entries
    WHERE id = entry_id AND user_id = auth.uid()
  )
);

-- Allow anyone to increment clicks
CREATE POLICY "Anyone can increment clicks"
ON public.share_tokens
FOR UPDATE
USING (true)
WITH CHECK (true);