-- Fix storage bucket policies to restrict users to their own folders
-- This prevents users from deleting or modifying other users' files

DROP POLICY IF EXISTS "Users can upload restaurant photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their restaurant photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their restaurant photos" ON storage.objects;

-- Allow users to upload only to their own folder
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update only their own files
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'restaurant-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete only their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'restaurant-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Add public album access for receipts and receipt items
CREATE POLICY "Anyone can view receipts in public albums"
ON receipts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM album_entries
    JOIN albums ON albums.id = album_entries.album_id
    WHERE album_entries.entry_id = receipts.entry_id
    AND albums.visibility = 'public'
  )
);

CREATE POLICY "Anyone can view receipt items in public albums"
ON receipt_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM receipts
    JOIN album_entries ON album_entries.entry_id = receipts.entry_id
    JOIN albums ON albums.id = album_entries.album_id
    WHERE receipt_items.receipt_id = receipts.id
    AND albums.visibility = 'public'
  )
);