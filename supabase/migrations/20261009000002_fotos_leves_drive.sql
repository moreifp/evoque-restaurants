-- Fotos leves no app + originais no Google Drive do dono.
-- Idempotente: pode rodar mais de uma vez.

-- 1. Novas colunas em restaurant_photos
alter table public.restaurant_photos
  add column if not exists thumb_url text,
  add column if not exists original_path text,
  add column if not exists drive_file_id text,
  add column if not exists original_saved_at timestamptz;

comment on column public.restaurant_photos.thumb_url is 'Miniatura JPEG ~400 px (bucket restaurant-photos). photo_url = versão de exibição (~1280/1600 px).';
comment on column public.restaurant_photos.original_path is 'Caminho do original no bucket privado originals-inbox, aguardando cópia para o Google Drive. NULL depois da cópia.';
comment on column public.restaurant_photos.drive_file_id is 'ID do arquivo original no Google Drive do dono (backup).';
comment on column public.restaurant_photos.original_saved_at is 'Quando o original foi salvo no Google Drive.';

-- Índice parcial para a varredura (sweep) de originais pendentes
create index if not exists idx_restaurant_photos_pending_original
  on public.restaurant_photos (created_at)
  where original_path is not null and drive_file_id is null;

-- 2. Lixeira de fotos: guardar também a miniatura para restaurar certo
alter table public.photo_backups
  add column if not exists thumb_url text;

create or replace function public.backup_photo_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_restaurant_name text;
begin
  select user_id, restaurant_name
    into v_user_id, v_restaurant_name
  from public.restaurant_entries
  where id = old.entry_id;

  if v_user_id is null then
    return old;
  end if;

  insert into public.photo_backups (
    original_photo_id, entry_id, user_id, restaurant_name,
    photo_url, thumb_url, caption, type, rating, menu_translation,
    original_created_at
  ) values (
    old.id, old.entry_id, v_user_id, v_restaurant_name,
    old.photo_url, old.thumb_url, old.caption, old.type, old.rating, old.menu_translation,
    old.created_at
  );

  return old;
end;
$$;

create or replace function public.backup_photos_before_entry_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.photo_backups (
    original_photo_id, entry_id, user_id, restaurant_name,
    photo_url, thumb_url, caption, type, rating, menu_translation,
    original_created_at
  )
  select
    p.id, p.entry_id, old.user_id, old.restaurant_name,
    p.photo_url, p.thumb_url, p.caption, p.type, p.rating, p.menu_translation,
    p.created_at
  from public.restaurant_photos p
  where p.entry_id = old.id;

  return old;
end;
$$;

-- 3. Bucket privado para originais aguardando envio ao Drive
insert into storage.buckets (id, name, public, file_size_limit)
values ('originals-inbox', 'originals-inbox', false, 52428800)
on conflict (id) do nothing;

-- Políticas: cada usuário só mexe na própria pasta (primeira pasta = auth.uid())
drop policy if exists "originals-inbox insert own folder" on storage.objects;
create policy "originals-inbox insert own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'originals-inbox'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "originals-inbox select own folder" on storage.objects;
create policy "originals-inbox select own folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'originals-inbox'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "originals-inbox delete own folder" on storage.objects;
create policy "originals-inbox delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'originals-inbox'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
