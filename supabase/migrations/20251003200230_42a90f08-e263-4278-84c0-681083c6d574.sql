-- Add RLS policy to allow anyone to view public albums
CREATE POLICY "Anyone can view public albums"
ON public.albums
FOR SELECT
USING (visibility = 'public');

-- Add RLS policy to allow anyone to view album entries for public albums
CREATE POLICY "Anyone can view entries for public albums"
ON public.album_entries
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.albums
    WHERE albums.id = album_entries.album_id
    AND albums.visibility = 'public'
  )
);

-- Add RLS policy to allow anyone to view restaurant entries in public albums
CREATE POLICY "Anyone can view restaurants in public albums"
ON public.restaurant_entries
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.album_entries
    JOIN public.albums ON albums.id = album_entries.album_id
    WHERE album_entries.entry_id = restaurant_entries.id
    AND albums.visibility = 'public'
  )
);

-- Add RLS policy to allow anyone to view photos for restaurants in public albums
CREATE POLICY "Anyone can view photos in public albums"
ON public.restaurant_photos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.album_entries
    JOIN public.albums ON albums.id = album_entries.album_id
    WHERE album_entries.entry_id = restaurant_photos.entry_id
    AND albums.visibility = 'public'
  )
);