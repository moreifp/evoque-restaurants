
-- 1. Add profile_visibility to profiles
ALTER TABLE public.profiles
ADD COLUMN profile_visibility text NOT NULL DEFAULT 'public';

-- 2. Add status column to user_follows
ALTER TABLE public.user_follows
ADD COLUMN status text NOT NULL DEFAULT 'accepted';

-- 3. Create follow_notifications table
CREATE TABLE public.follow_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  type text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.follow_notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.follow_notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
ON public.follow_notifications FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
ON public.follow_notifications FOR INSERT
WITH CHECK (true);

-- 4. Add UPDATE policy on user_follows for target user to approve/reject
CREATE POLICY "Target user can update follow status"
ON public.user_follows FOR UPDATE
USING (auth.uid() = following_id);

-- 5. Security definer function to get profile visibility without RLS recursion
CREATE OR REPLACE FUNCTION public.get_profile_visibility(target_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(profile_visibility, 'public')
  FROM profiles
  WHERE id = target_user_id
$$;

-- 6. Security definer function to check accepted follow status
CREATE OR REPLACE FUNCTION public.is_accepted_follower(follower uuid, target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_follows
    WHERE follower_id = follower
      AND following_id = target
      AND status = 'accepted'
  )
$$;

-- 7. Trigger to create notifications on follow insert/update
CREATE OR REPLACE FUNCTION public.handle_follow_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'accepted' THEN
      -- New follower notification
      INSERT INTO follow_notifications (user_id, actor_id, type)
      VALUES (NEW.following_id, NEW.follower_id, 'new_follower');
    ELSIF NEW.status = 'pending' THEN
      -- Follow request notification
      INSERT INTO follow_notifications (user_id, actor_id, type)
      VALUES (NEW.following_id, NEW.follower_id, 'follow_request');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
      -- Follow accepted notification (notify the requester)
      INSERT INTO follow_notifications (user_id, actor_id, type)
      VALUES (NEW.follower_id, NEW.following_id, 'follow_accepted');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_follow_change
AFTER INSERT OR UPDATE ON public.user_follows
FOR EACH ROW
EXECUTE FUNCTION public.handle_follow_notification();

-- 8. Update search_users_fuzzy to exclude private profiles
CREATE OR REPLACE FUNCTION public.search_users_fuzzy(search_term text, exclude_user_id uuid, max_results integer DEFAULT 10)
RETURNS TABLE(id uuid, display_name text, avatar_url text, similarity_score real)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.display_name,
    p.avatar_url,
    similarity(LOWER(p.display_name), LOWER(search_term)) AS similarity_score
  FROM profiles p
  WHERE 
    p.id != exclude_user_id
    AND p.display_name IS NOT NULL
    AND COALESCE(p.profile_visibility, 'public') != 'private'
    AND (
      similarity(LOWER(p.display_name), LOWER(search_term)) > 0.2
      OR
      LOWER(p.display_name) ILIKE '%' || LOWER(search_term) || '%'
    )
  ORDER BY 
    similarity(LOWER(p.display_name), LOWER(search_term)) DESC,
    p.display_name ASC
  LIMIT max_results;
END;
$$;

-- 9. Add index on follow_notifications for fast queries
CREATE INDEX idx_follow_notifications_user_id ON public.follow_notifications(user_id, read, created_at DESC);
CREATE INDEX idx_user_follows_status ON public.user_follows(status);
