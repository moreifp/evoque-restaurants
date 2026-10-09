-- Índices para as consultas de fotos e álbuns por restaurante (entry_id).
-- album_entries tem PK (album_id, entry_id); a busca só por entry_id não usa a PK.
create index if not exists idx_restaurant_photos_entry_id on public.restaurant_photos (entry_id);
create index if not exists idx_album_entries_entry_id on public.album_entries (entry_id);
