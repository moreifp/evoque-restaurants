
-- Restrictive RLS policies to hide content from blocked users (bidirectional)
-- These use the existing is_blocked_by() security definer function

-- Albums: deny SELECT for blocked users (only for logged-in users)
CREATE POLICY "Hide albums from blocked users"
ON public.albums
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  NOT (
    public.is_blocked_by(auth.uid(), user_id)
    OR public.is_blocked_by(user_id, auth.uid())
  )
);

-- Restaurant entries: deny SELECT for blocked users (only for logged-in users)
CREATE POLICY "Hide entries from blocked users"
ON public.restaurant_entries
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  NOT (
    public.is_blocked_by(auth.uid(), user_id)
    OR public.is_blocked_by(user_id, auth.uid())
  )
);
