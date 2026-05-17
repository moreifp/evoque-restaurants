
ALTER TABLE public.restaurant_notes
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill: delete orphan rows (none expected; table unused by app)
DELETE FROM public.restaurant_notes WHERE user_id IS NULL;

ALTER TABLE public.restaurant_notes
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN user_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Users can view all restaurant notes" ON public.restaurant_notes;
DROP POLICY IF EXISTS "Users can create restaurant notes" ON public.restaurant_notes;
DROP POLICY IF EXISTS "Users can update restaurant notes" ON public.restaurant_notes;

CREATE POLICY "Users can view their own restaurant notes"
ON public.restaurant_notes FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own restaurant notes"
ON public.restaurant_notes FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own restaurant notes"
ON public.restaurant_notes FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own restaurant notes"
ON public.restaurant_notes FOR DELETE TO authenticated
USING (user_id = auth.uid());
