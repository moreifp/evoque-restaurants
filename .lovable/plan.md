## Problema

Em `AddRestaurant`, o autosave atual só grava em `localStorage` as URLs das fotos já enviadas (debounce 1s). No WebView iOS do Despia, o `localStorage` pode ser purgado em refresh por memory-pressure, e o `File`/blob local não pode ser persistido. Resultado: usuário sobe várias fotos, app é refrescado antes do "Save" → tudo perde.

## Solução: rascunho real no banco

Criar a entrada do restaurante como **rascunho** na primeira foto enviada, e passar `entryId` para `UnifiedMediaUpload`. A partir daí cada foto cai direto em `restaurant_photos` (mesmo fluxo do modo edição). Se o usuário fechar/refrescar, o rascunho fica salvo no banco e é restaurado na próxima abertura.

## Mudanças

### 1. Migração (banco)
- Adicionar coluna `is_draft boolean NOT NULL DEFAULT false` em `restaurant_entries`.
- Index parcial `(user_id) WHERE is_draft = true` para lookup rápido do rascunho do usuário.
- Filtrar `is_draft = false` em todos os pontos de leitura usados pelo Dining/Home/Albums (vou listar e ajustar).

### 2. `src/pages/AddRestaurant.tsx`
- **Mount**:
  - Buscar rascunho existente do usuário (`is_draft = true`, ordenado por `updated_at` desc, limit 1).
  - Se houver: carregar `formData`, fotos (de `restaurant_photos`), receipt, álbum, tags, social links — substitui o restore via localStorage para fotos.
  - Toast: "Rascunho restaurado".
- **Criar rascunho on-demand**: hook `ensureDraftEntry()` que faz `INSERT` com `is_draft=true` e nome temporário `""` se ainda não existir, retornando `entry.id`. É chamado:
  - Quando o usuário envia a primeira foto (handler injetado em `UnifiedMediaUpload` via novo prop `onBeforeFirstUpload`).
  - Quando o usuário começa a digitar campos (debounce).
- **`handleSubmit`**:
  - Se já existe `draftEntryId`: `UPDATE restaurant_entries SET ..., is_draft = false WHERE id = draftEntryId`.
  - Não reinserir fotos (já estão em `restaurant_photos` ligadas ao `entry_id`).
  - Receipt/álbum/tags/social links: inserir se ainda não inseridos (UnifiedMediaUpload já salva receipt; ajustar lógica).
- Manter `localStorage` apenas para campos de texto curtos (segurança extra), mas fotos passam a viver no banco.

### 3. `src/components/UnifiedMediaUpload.tsx`
- Aceitar novo prop opcional `onRequestEntryId?: () => Promise<string>`.
- Em `autoUploadFiles`: se não houver `entryId` mas houver `onRequestEntryId`, chamar para obter um e tratar como modo edição (insert em `restaurant_photos`).
- Sem mudanças no fluxo iOS.

### 4. Filtros `is_draft = false`
Ajustar queries que listam restaurantes:
- `src/hooks/useRestaurantEntries.ts`
- `src/pages/Dining.tsx`, `src/pages/Index.tsx`, `src/pages/AlbumDetail.tsx`, `src/pages/AlbumsMap.tsx`, `src/pages/UserPublicAlbums.tsx`, `src/pages/SharedByToken.tsx`, `src/pages/SharedRestaurant.tsx`, `src/components/agenda/*`, qualquer JOIN que use `restaurant_entries`.

### 5. Limpeza de rascunhos antigos
- Botão "Descartar rascunho" no topo do `AddRestaurant` quando um rascunho está ativo (DELETE cascata).
- Não fazer purge automático nesta entrega (evita perder dados do Fausto).

## Validação

- Criar restaurante novo no TestFlight, subir 3 fotos, fechar app via swipe up → reabrir `/add` → ver "Rascunho restaurado" com as 3 fotos visíveis.
- Salvar normalmente → rascunho some, restaurante aparece em `/dining`.
- Verificar que `/dining`, `/`, `AlbumsMap`, share links **não** mostram rascunhos.

## Risco

Mudança toca muitos pontos de leitura. Vou listar e atualizar todos antes de fechar. Se preferir uma versão mais minimalista (só salvar fotos em banco via draft, sem flag `is_draft` e sem restaurar form), me avise.
