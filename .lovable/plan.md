
# Plano: Corrigir Vazamento de Álbuns Entre Usuários

## Problema Identificado
A página "Meus Álbuns" (Dining → aba Albums) está mostrando álbuns públicos de **outros usuários** para contas novas. Isso acontece porque:

1. A query em `useAlbums.ts` busca todos os álbuns sem filtrar por `user_id`
2. A política RLS "Anyone can view public albums" permite ver álbuns com `visibility = 'public'`
3. Resultado: novos usuários veem álbuns como "Recife" e "New York" de outros usuários

### Álbuns Públicos no Sistema
| Título | Proprietário |
|--------|--------------|
| Recife | a9ebe544-... |
| New york | a9ebe544-... |

## Solução
Adicionar filtro `user_id` na query para garantir que apenas os álbuns do próprio usuário sejam exibidos na tela principal.

### Arquivo: `src/hooks/useAlbums.ts`
Modificar a função `fetchAlbums` para filtrar por usuário:

```text
Antes:
const { data, error } = await supabase
  .from("albums")
  .select("*")
  .order("created_at", { ascending: false });

Depois:
// Obter usuário autenticado
const { data: { user } } = await supabase.auth.getUser();
if (!user) return [];

const { data, error } = await supabase
  .from("albums")
  .select("*")
  .eq("user_id", user.id)  // ← Filtro adicionado
  .order("created_at", { ascending: false });
```

### Arquivo: `src/components/AlbumSelector.tsx`
Mesmo problema existe aqui (linha 35-39). Adicionar filtro:

```text
Depois:
const { data: { user } } = await supabase.auth.getUser();
if (!user) return;

const { data } = await supabase
  .from("albums")
  .select("*")
  .eq("user_id", user.id)  // ← Filtro adicionado
  .order("created_at", { ascending: false });
```

## Por Que Não Alterar o RLS?
A política "Anyone can view public albums" é **correta e necessária** para:
- Página `UserPublicAlbums.tsx` (ver álbuns públicos de um usuário específico)
- Compartilhamento de links de álbuns públicos
- Funcionalidade de descoberta futura

O problema está no **código**, não no RLS. O código deve filtrar explicitamente quando quer mostrar apenas os álbuns do próprio usuário.

## Arquivos a Modificar
1. `src/hooks/useAlbums.ts` - adicionar `.eq("user_id", user.id)`
2. `src/components/AlbumSelector.tsx` - adicionar `.eq("user_id", user.id)`

## Resultado Esperado
- Novos usuários verão uma lista vazia de álbuns (correto!)
- Usuários existentes verão apenas seus próprios álbuns
- Álbuns públicos ainda serão visíveis via `UserPublicAlbums.tsx` e links diretos
