-- Allow public read access to restaurant photos in storage
-- This enables unauthenticated users to view images from shared restaurant entries

CREATE POLICY "Public can view restaurant photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'restaurant-photos');