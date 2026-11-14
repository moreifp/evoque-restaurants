-- Equipe do restaurante (maître, garçons, sommelier...): texto livre digitado pelo usuário.
alter table public.restaurant_entries add column if not exists staff text;
