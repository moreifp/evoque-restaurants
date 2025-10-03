-- Create storage policies for restaurant-photos bucket to allow uploads

-- Allow authenticated users to upload their own photos
CREATE POLICY "Users can upload restaurant photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'restaurant-photos');

-- Allow authenticated users to update their own photos
CREATE POLICY "Users can update their restaurant photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'restaurant-photos');

-- Allow authenticated users to delete their own photos
CREATE POLICY "Users can delete their restaurant photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'restaurant-photos');