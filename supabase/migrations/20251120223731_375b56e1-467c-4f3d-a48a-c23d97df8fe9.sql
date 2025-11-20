-- Remove policies that allow public access to receipts
DROP POLICY IF EXISTS "Anyone can view receipts for public entries" ON public.receipts;
DROP POLICY IF EXISTS "Anyone can view receipts in public albums" ON public.receipts;
DROP POLICY IF EXISTS "Public can view receipts of shared entries" ON public.receipts;

-- Remove policies that allow public access to receipt_items
DROP POLICY IF EXISTS "Anyone can view receipt items for public entries" ON public.receipt_items;
DROP POLICY IF EXISTS "Anyone can view receipt items in public albums" ON public.receipt_items;
DROP POLICY IF EXISTS "Public can view items of shared receipts" ON public.receipt_items;

-- The owner policies already exist and are sufficient:
-- "Users can view receipts for their own entries"
-- "Users can view receipt items for their own entries"