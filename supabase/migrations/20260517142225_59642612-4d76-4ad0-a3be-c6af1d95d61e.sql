
DROP POLICY IF EXISTS "Authenticated users can upload to restaurant-photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their files in restaurant-photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their files in restaurant-photos" ON storage.objects;

CREATE POLICY "Authenticated users can upload to restaurant-photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-photos'
  AND (auth.uid())::text = ANY (storage.foldername(name))
);

CREATE POLICY "Users can update their files in restaurant-photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'restaurant-photos'
  AND (auth.uid())::text = ANY (storage.foldername(name))
);

CREATE POLICY "Users can delete their files in restaurant-photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'restaurant-photos'
  AND (auth.uid())::text = ANY (storage.foldername(name))
);
