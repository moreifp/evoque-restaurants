-- Add rating column to restaurant_photos table for wine ratings
ALTER TABLE restaurant_photos 
ADD COLUMN rating INTEGER CHECK (rating >= 0 AND rating <= 5);