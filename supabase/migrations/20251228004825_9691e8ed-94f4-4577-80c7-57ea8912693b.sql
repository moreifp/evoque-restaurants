-- Add menu_translation column to store AI-translated menu text
ALTER TABLE public.restaurant_photos ADD COLUMN menu_translation TEXT;