
-- Drop the overly permissive public INSERT policy
DROP POLICY IF EXISTS "System can insert notifications" ON follow_notifications;

-- Create a restrictive policy: only allow inserts that match an existing follow relationship
CREATE POLICY "Only valid follow actions can insert notifications"
  ON follow_notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_follows
      WHERE (follower_id = actor_id AND following_id = user_id)
         OR (follower_id = user_id AND following_id = actor_id)
    )
  );

-- Recreate the trigger that was missing (handles notification creation server-side)
DROP TRIGGER IF EXISTS on_follow_change ON user_follows;
CREATE TRIGGER on_follow_change
  AFTER INSERT OR UPDATE ON user_follows
  FOR EACH ROW
  EXECUTE FUNCTION handle_follow_notification();
