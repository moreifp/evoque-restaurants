-- Adicionar coluna google_place_id à tabela restaurant_entries
ALTER TABLE public.restaurant_entries 
ADD COLUMN google_place_id TEXT;

-- Adicionar índice para buscas rápidas
CREATE INDEX idx_restaurant_entries_google_place_id 
ON public.restaurant_entries(google_place_id);

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.restaurant_entries.google_place_id 
IS 'Google Place ID para linking direto ao Google Maps/Places';