
-- Restrict profiles SELECT to self only
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Public view exposing only non-sensitive columns for cross-user lookups
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT id, display_name, avatar_url, profile_visibility, created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
