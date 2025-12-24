-- Remove the public SELECT policy that exposes all share tokens
DROP POLICY IF EXISTS "Anyone can view share tokens" ON public.share_tokens;

-- Keep the policy for users to view tokens for their own entries
-- (already exists: "Users can view tokens for their own entries")

-- Keep the policy for anyone to increment clicks since the edge function uses service role
-- Actually, we can remove this too since the edge function bypasses RLS
DROP POLICY IF EXISTS "Anyone can increment clicks" ON public.share_tokens;