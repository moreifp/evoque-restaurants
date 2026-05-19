# Backup e restauração automática de fotos

## Objetivo
Garantir que nenhuma foto de restaurante seja perdida após exclusão (manual, acidental ou em cascata), permitindo restaurar com 1 clique por até **30 dias**.

## Estratégia
Soft-backup automático no banco via **trigger** — zero alteração nos fluxos de upload/edição existentes. Os arquivos no Storage já são preservados (o app só apaga linhas no DB, nunca o objeto no bucket `restaurant-photos`), portanto basta preservar os metadados.

## Mudanças no banco (migration)

1. **Nova tabela `photo_backups`** (snapshot histórico):
   - `id`, `original_photo_id`, `entry_id`, `user_id` (dono — para RLS direta)
   - `restaurant_name` (snapshot, caso a entry também seja apagada)
   - `photo_url`, `caption`, `type`, `rating`, `menu_translation`
   - `deleted_at` (default `now()`), `original_created_at`
   - `restored` boolean default false
   - Índices em `user_id` e `deleted_at`

2. **Trigger `backup_photo_on_delete`** em `restaurant_photos BEFORE DELETE`:
   - Faz lookup do `user_id` e `restaurant_name` via join com `restaurant_entries` (se ainda existir; senão usa o último valor conhecido capturado em outro trigger).
   - Insere em `photo_backups`.

3. **Trigger `backup_photos_on_entry_delete`** em `restaurant_entries BEFORE DELETE`:
   - Copia todas as fotos vinculadas para `photo_backups` antes que a entry seja excluída (não há cascade, mas garante captura mesmo se o app deletar fotos junto).

4. **RLS em `photo_backups`**:
   - SELECT/UPDATE/DELETE apenas onde `user_id = auth.uid()`.
   - INSERT apenas via trigger (sem policy → bloqueado para clientes).

5. **Retenção**: coluna `deleted_at` indexada; limpeza opcional manual depois (não criar cron agora).

## Mudanças no frontend

1. **`src/hooks/useDeletedPhotos.ts`** — fetch de `photo_backups` do usuário onde `restored = false` e `deleted_at > now() - 30d`, agrupado por `restaurant_name`.

2. **`src/components/PhotoTrashDialog.tsx`** — modal acessível via:
   - Botão "Lixeira de fotos" em **Settings** (acesso global).
   - Botão "Recuperar fotos" no menu de ações de cada restaurante em **RestaurantDetail** (filtrado por `entry_id` quando aplicável).
   - Grid de thumbnails, seleção múltipla, botão **Restaurar selecionadas**.
   - Restauração: insere de volta em `restaurant_photos` com os campos originais, marca o backup como `restored = true`. Se a entry original não existir mais, mostra aviso e permite escolher entry de destino.

3. **i18n**: chaves em pt/en (`photoTrash.title`, `restore`, `emptyTrash`, `daysRemaining`, etc.).

## Fora do escopo
- Versionamento de edições de foto (apenas exclusão).
- Backup de receipts/áudio (somente fotos).
- Purge automático via cron (retenção apenas visual de 30 dias; dados ficam no DB).

## Validação
- Excluir uma foto → conferir aparecimento na Lixeira → restaurar → confirmar que volta ao restaurante.
- Excluir um restaurante inteiro → conferir que todas as fotos vão para a Lixeira com o nome do restaurante preservado.
