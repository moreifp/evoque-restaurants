
-- Photo backups table for soft-delete / restore
CREATE TABLE public.photo_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_photo_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  user_id uuid NOT NULL,
  restaurant_name text,
  photo_url text NOT NULL,
  caption text,
  type text,
  rating integer,
  menu_translation text,
  original_created_at timestamptz,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  restored boolean NOT NULL DEFAULT false,
  restored_at timestamptz
);

CREATE INDEX idx_photo_backups_user ON public.photo_backups(user_id, deleted_at DESC);
CREATE INDEX idx_photo_backups_entry ON public.photo_backups(entry_id);

ALTER TABLE public.photo_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own photo backups"
  ON public.photo_backups FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own photo backups"
  ON public.photo_backups FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own photo backups"
  ON public.photo_backups FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
-- No INSERT policy: only triggers (SECURITY DEFINER) can insert.

-- Trigger fn: backup a photo before it is deleted
CREATE OR REPLACE FUNCTION public.backup_photo_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_restaurant_name text;
BEGIN
  SELECT user_id, restaurant_name
    INTO v_user_id, v_restaurant_name
  FROM public.restaurant_entries
  WHERE id = OLD.entry_id;

  IF v_user_id IS NULL THEN
    -- Entry already gone (e.g. mid-cascade) — still keep the metadata,
    -- attribute to whoever inserted, fall back to NULL-safe placeholder.
    RETURN OLD;
  END IF;

  INSERT INTO public.photo_backups (
    original_photo_id, entry_id, user_id, restaurant_name,
    photo_url, caption, type, rating, menu_translation,
    original_created_at
  ) VALUES (
    OLD.id, OLD.entry_id, v_user_id, v_restaurant_name,
    OLD.photo_url, OLD.caption, OLD.type, OLD.rating, OLD.menu_translation,
    OLD.created_at
  );

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_backup_photo_before_delete
BEFORE DELETE ON public.restaurant_photos
FOR EACH ROW EXECUTE FUNCTION public.backup_photo_before_delete();

-- Trigger fn: when an entry is deleted, snapshot its photos first
CREATE OR REPLACE FUNCTION public.backup_photos_before_entry_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.photo_backups (
    original_photo_id, entry_id, user_id, restaurant_name,
    photo_url, caption, type, rating, menu_translation,
    original_created_at
  )
  SELECT
    p.id, p.entry_id, OLD.user_id, OLD.restaurant_name,
    p.photo_url, p.caption, p.type, p.rating, p.menu_translation,
    p.created_at
  FROM public.restaurant_photos p
  WHERE p.entry_id = OLD.id;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_backup_photos_before_entry_delete
BEFORE DELETE ON public.restaurant_entries
FOR EACH ROW EXECUTE FUNCTION public.backup_photos_before_entry_delete();
