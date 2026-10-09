-- Por onde a foto foi enviada: "viagens" (Restaurants aberto dentro do Evoque Viagens) ou "direto".
-- Decide a pasta do original no Drive: <Viagem>/Restaurants/<restaurante>/ ou Restaurants/<restaurante>/.
alter table public.restaurant_photos add column if not exists upload_origin text;
