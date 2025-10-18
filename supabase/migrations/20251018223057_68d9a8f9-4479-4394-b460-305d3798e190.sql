-- Add is_public flag to restaurant_entries
ALTER TABLE public.restaurant_entries 
ADD COLUMN is_public boolean DEFAULT false;

-- Create index for better performance on public entries
CREATE INDEX idx_restaurant_entries_is_public ON public.restaurant_entries(is_public) WHERE is_public = true;

-- Add RLS policy to allow anyone to view public restaurant entries
CREATE POLICY "Anyone can view public restaurant entries"
ON public.restaurant_entries
FOR SELECT
USING (is_public = true);

-- Add RLS policy to allow anyone to view photos for public entries
CREATE POLICY "Anyone can view photos for public entries"
ON public.restaurant_photos
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM restaurant_entries 
  WHERE restaurant_entries.id = restaurant_photos.entry_id 
  AND restaurant_entries.is_public = true
));

-- Add RLS policy to allow anyone to view receipts for public entries
CREATE POLICY "Anyone can view receipts for public entries"
ON public.receipts
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM restaurant_entries 
  WHERE restaurant_entries.id = receipts.entry_id 
  AND restaurant_entries.is_public = true
));

-- Add RLS policy to allow anyone to view receipt items for public entries
CREATE POLICY "Anyone can view receipt items for public entries"
ON public.receipt_items
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM receipts
  JOIN restaurant_entries ON restaurant_entries.id = receipts.entry_id
  WHERE receipt_items.receipt_id = receipts.id 
  AND restaurant_entries.is_public = true
));