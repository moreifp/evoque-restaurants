ALTER TABLE public.restaurant_entries
ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_restaurant_entries_user_draft
  ON public.restaurant_entries (user_id, updated_at DESC)
  WHERE is_draft = true;

CREATE INDEX IF NOT EXISTS idx_restaurant_entries_user_published
  ON public.restaurant_entries (user_id)
  WHERE is_draft = false;