-- Nota fiscal (NFC-e) enviada pelo favorito "Enviar ao Evoque" do Safari.
-- A Sefaz só abre a nota no celular da pessoa; o favorito manda o texto da nota
-- para a função receive-nfce, que grava aqui. O app pega a nota e grava no Recibo.

-- Chave pessoal de envio (vai dentro do favorito). Uma por usuário.
create table if not exists public.nfce_send_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key text not null unique check (length(key) >= 24),
  created_at timestamptz not null default now()
);
alter table public.nfce_send_keys enable row level security;
create policy "nfce_send_keys dono le" on public.nfce_send_keys for select using (auth.uid() = user_id);
create policy "nfce_send_keys dono cria" on public.nfce_send_keys for insert with check (auth.uid() = user_id);
create policy "nfce_send_keys dono troca" on public.nfce_send_keys for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "nfce_send_keys dono apaga" on public.nfce_send_keys for delete using (auth.uid() = user_id);

-- Notas recebidas, esperando o app gravar no restaurante aberto.
create table if not exists public.pending_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_url text,
  data jsonb not null,
  status text not null default 'new' check (status in ('new', 'used')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists pending_receipts_user_new on public.pending_receipts (user_id, created_at desc) where status = 'new';
alter table public.pending_receipts enable row level security;
-- O app só lê e marca como usada; quem grava é a função (service role).
create policy "pending_receipts dono le" on public.pending_receipts for select using (auth.uid() = user_id);
create policy "pending_receipts dono marca" on public.pending_receipts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pending_receipts dono apaga" on public.pending_receipts for delete using (auth.uid() = user_id);
