-- Create content_reports table for UGC moderation
CREATE TABLE public.content_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('restaurant', 'album', 'user')),
    target_id UUID NOT NULL,
    target_user_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('inappropriate', 'spam', 'offensive', 'other')),
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_blocks table for blocking users
CREATE TABLE public.user_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL,
    blocked_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (blocker_id, blocked_id)
);

-- Enable RLS on both tables
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- RLS policies for content_reports
CREATE POLICY "Users can create reports"
ON public.content_reports
FOR INSERT
WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view their own reports"
ON public.content_reports
FOR SELECT
USING (auth.uid() = reporter_id);

-- RLS policies for user_blocks
CREATE POLICY "Users can block others"
ON public.user_blocks
FOR INSERT
WITH CHECK (auth.uid() = blocker_id AND auth.uid() != blocked_id);

CREATE POLICY "Users can view their blocks"
ON public.user_blocks
FOR SELECT
USING (auth.uid() = blocker_id);

CREATE POLICY "Users can unblock"
ON public.user_blocks
FOR DELETE
USING (auth.uid() = blocker_id);

-- Create function to check if a user is blocked (for filtering content)
CREATE OR REPLACE FUNCTION public.is_blocked_by(blocker UUID, blocked UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_blocks
    WHERE blocker_id = blocker
      AND blocked_id = blocked
  )
$$;