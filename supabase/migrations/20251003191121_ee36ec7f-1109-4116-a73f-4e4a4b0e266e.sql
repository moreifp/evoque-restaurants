-- Create profiles table for user information
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles are viewable by everyone
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create tags table
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Tags are viewable by everyone
CREATE POLICY "Tags are viewable by everyone"
  ON public.tags FOR SELECT
  USING (true);

-- Users can create tags
CREATE POLICY "Users can create tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create albums table
CREATE TABLE IF NOT EXISTS public.albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  visibility TEXT DEFAULT 'private',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;

-- Users can view their own albums
CREATE POLICY "Users can view their own albums"
  ON public.albums FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own albums
CREATE POLICY "Users can create their own albums"
  ON public.albums FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own albums
CREATE POLICY "Users can update their own albums"
  ON public.albums FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own albums
CREATE POLICY "Users can delete their own albums"
  ON public.albums FOR DELETE
  USING (auth.uid() = user_id);

-- Create restaurant_entries table
CREATE TABLE IF NOT EXISTS public.restaurant_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_name TEXT NOT NULL,
  visit_date DATE NOT NULL,
  location_address TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  companions TEXT,
  notes TEXT,
  voice_note_url TEXT,
  voice_transcription TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.restaurant_entries ENABLE ROW LEVEL SECURITY;

-- Users can view their own restaurant entries
CREATE POLICY "Users can view their own restaurant entries"
  ON public.restaurant_entries FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own restaurant entries
CREATE POLICY "Users can create their own restaurant entries"
  ON public.restaurant_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own restaurant entries
CREATE POLICY "Users can update their own restaurant entries"
  ON public.restaurant_entries FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own restaurant entries
CREATE POLICY "Users can delete their own restaurant entries"
  ON public.restaurant_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Create restaurant_photos table
CREATE TABLE IF NOT EXISTS public.restaurant_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.restaurant_entries(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  type TEXT DEFAULT 'restaurant_photo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.restaurant_photos ENABLE ROW LEVEL SECURITY;

-- Users can view photos for their own entries
CREATE POLICY "Users can view photos for their own entries"
  ON public.restaurant_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

-- Users can create photos for their own entries
CREATE POLICY "Users can create photos for their own entries"
  ON public.restaurant_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

-- Users can delete photos for their own entries
CREATE POLICY "Users can delete photos for their own entries"
  ON public.restaurant_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

-- Create entry_tags junction table
CREATE TABLE IF NOT EXISTS public.entry_tags (
  entry_id UUID NOT NULL REFERENCES public.restaurant_entries(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

ALTER TABLE public.entry_tags ENABLE ROW LEVEL SECURITY;

-- Users can view tags for their own entries
CREATE POLICY "Users can view tags for their own entries"
  ON public.entry_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

-- Users can create tags for their own entries
CREATE POLICY "Users can create tags for their own entries"
  ON public.entry_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

-- Users can delete tags for their own entries
CREATE POLICY "Users can delete tags for their own entries"
  ON public.entry_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

-- Create album_entries junction table
CREATE TABLE IF NOT EXISTS public.album_entries (
  album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.restaurant_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (album_id, entry_id)
);

ALTER TABLE public.album_entries ENABLE ROW LEVEL SECURITY;

-- Users can view album entries for their own albums
CREATE POLICY "Users can view album entries for their own albums"
  ON public.album_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.albums
      WHERE albums.id = album_id
      AND albums.user_id = auth.uid()
    )
  );

-- Users can create album entries for their own albums
CREATE POLICY "Users can create album entries for their own albums"
  ON public.album_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.albums
      WHERE albums.id = album_id
      AND albums.user_id = auth.uid()
    )
  );

-- Users can delete album entries for their own albums
CREATE POLICY "Users can delete album entries for their own albums"
  ON public.album_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.albums
      WHERE albums.id = album_id
      AND albums.user_id = auth.uid()
    )
  );

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at columns
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_albums_updated_at
  BEFORE UPDATE ON public.albums
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_restaurant_entries_updated_at
  BEFORE UPDATE ON public.restaurant_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for restaurant photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-photos', 'restaurant-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own photos
CREATE POLICY "Users can upload their own photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'restaurant-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to view their own photos
CREATE POLICY "Users can view their own photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'restaurant-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to delete their own photos
CREATE POLICY "Users can delete their own photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'restaurant-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );