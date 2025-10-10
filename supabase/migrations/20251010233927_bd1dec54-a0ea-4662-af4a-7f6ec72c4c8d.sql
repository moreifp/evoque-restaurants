-- Clean up duplicate storage policies
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;

-- Add missing UPDATE policy for restaurant_photos
CREATE POLICY "Users can update photos for their own entries"
ON restaurant_photos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM restaurant_entries
    WHERE restaurant_entries.id = restaurant_photos.entry_id
      AND restaurant_entries.user_id = auth.uid()
  )
);