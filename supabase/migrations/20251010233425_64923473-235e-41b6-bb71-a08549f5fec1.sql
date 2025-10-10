-- Enable authenticated users to upload files to restaurant-photos bucket
CREATE POLICY "Authenticated users can upload to restaurant-photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'restaurant-photos');

-- Enable authenticated users to view their own files
CREATE POLICY "Users can view files in restaurant-photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'restaurant-photos');

-- Enable authenticated users to update their own files
CREATE POLICY "Users can update their files in restaurant-photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'restaurant-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable authenticated users to delete their own files
CREATE POLICY "Users can delete their files in restaurant-photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'restaurant-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public to view files in public bucket
CREATE POLICY "Public can view restaurant-photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'restaurant-photos');