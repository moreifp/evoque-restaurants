-- Create table for social media links
CREATE TABLE public.restaurant_social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.restaurant_entries(id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text NOT NULL,
  title text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_url CHECK (url ~* '^https?://')
);

-- Enable RLS
ALTER TABLE public.restaurant_social_links ENABLE ROW LEVEL SECURITY;

-- Users can view links for their own entries
CREATE POLICY "Users can view links for their own entries"
  ON public.restaurant_social_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.restaurant_entries
    WHERE restaurant_entries.id = restaurant_social_links.entry_id
    AND restaurant_entries.user_id = auth.uid()
  ));

-- Anyone can view links for public entries
CREATE POLICY "Anyone can view links for public entries"
  ON public.restaurant_social_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.restaurant_entries
    WHERE restaurant_entries.id = restaurant_social_links.entry_id
    AND restaurant_entries.is_public = true
  ));

-- Users can create links for their own entries
CREATE POLICY "Users can create links for their own entries"
  ON public.restaurant_social_links FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurant_entries
    WHERE restaurant_entries.id = restaurant_social_links.entry_id
    AND restaurant_entries.user_id = auth.uid()
  ));

-- Users can update links for their own entries
CREATE POLICY "Users can update links for their own entries"
  ON public.restaurant_social_links FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.restaurant_entries
    WHERE restaurant_entries.id = restaurant_social_links.entry_id
    AND restaurant_entries.user_id = auth.uid()
  ));

-- Users can delete links for their own entries
CREATE POLICY "Users can delete links for their own entries"
  ON public.restaurant_social_links FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.restaurant_entries
    WHERE restaurant_entries.id = restaurant_social_links.entry_id
    AND restaurant_entries.user_id = auth.uid()
  ));

-- Create index for faster queries
CREATE INDEX idx_restaurant_social_links_entry_id ON public.restaurant_social_links(entry_id);