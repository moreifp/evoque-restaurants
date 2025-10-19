-- Enable public viewing of shared restaurant entries and related data
-- Safe conditional creation of RLS policies allowing anonymous (public) SELECT when is_public = true

-- Ensure RLS is enabled on relevant tables
ALTER TABLE IF EXISTS public.restaurant_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.restaurant_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.receipt_items ENABLE ROW LEVEL SECURITY;

-- Restaurant entries: allow anyone to SELECT rows where is_public = true
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'restaurant_entries' AND policyname = 'Public can view shared restaurant entries'
  ) THEN
    CREATE POLICY "Public can view shared restaurant entries"
    ON public.restaurant_entries
    FOR SELECT
    TO public
    USING (is_public = true);
  END IF;
END$$;

-- Photos: allow anyone to SELECT photos that belong to a public restaurant entry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'restaurant_photos' AND policyname = 'Public can view photos of shared entries'
  ) THEN
    CREATE POLICY "Public can view photos of shared entries"
    ON public.restaurant_photos
    FOR SELECT
    TO public
    USING (
      EXISTS (
        SELECT 1
        FROM public.restaurant_entries e
        WHERE e.id = restaurant_photos.entry_id
          AND e.is_public = true
      )
    );
  END IF;
END$$;

-- Receipts: allow anyone to SELECT receipts that belong to a public restaurant entry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'receipts' AND policyname = 'Public can view receipts of shared entries'
  ) THEN
    CREATE POLICY "Public can view receipts of shared entries"
    ON public.receipts
    FOR SELECT
    TO public
    USING (
      EXISTS (
        SELECT 1
        FROM public.restaurant_entries e
        WHERE e.id = receipts.entry_id
          AND e.is_public = true
      )
    );
  END IF;
END$$;

-- Receipt items: allow anyone to SELECT items for receipts that belong to a public restaurant entry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'receipt_items' AND policyname = 'Public can view items of shared receipts'
  ) THEN
    CREATE POLICY "Public can view items of shared receipts"
    ON public.receipt_items
    FOR SELECT
    TO public
    USING (
      EXISTS (
        SELECT 1
        FROM public.receipts r
        JOIN public.restaurant_entries e ON e.id = r.entry_id
        WHERE r.id = receipt_items.receipt_id
          AND e.is_public = true
      )
    );
  END IF;
END$$;