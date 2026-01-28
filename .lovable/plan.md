

# Plano: Melhorar Busca de Usuários no Social

## Problema Identificado
Conforme mostrado na captura de tela, digitar apenas **1 letra** ("a") retorna uma lista extensa de todos os usuários cujo nome contém essa letra. Isso:
- Expõe muitos usuários da plataforma desnecessariamente
- Não é uma experiência de busca eficiente
- Não tolera erros de digitação (typos)

## Solução Proposta
Implementar uma busca mais inteligente e restritiva, seguindo padrões de redes sociais como Instagram e Twitter:

### Regras da Nova Busca
| Característica | Implementação |
|----------------|---------------|
| **Mínimo de caracteres** | 3 letras para iniciar a busca |
| **Tolerância a typos** | Usar algoritmo de similaridade (trigram) |
| **Feedback visual** | Mensagem explicando o mínimo necessário |
| **Limite de resultados** | Máximo 10 resultados, ordenados por relevância |

---

## Arquitetura Técnica

### Opção 1: Fuzzy Search no Frontend (JavaScript)
Implementar algoritmo de Levenshtein no cliente para ordenar resultados por similaridade.

**Vantagem**: Não requer mudança no banco
**Desvantagem**: Busca inicial ainda retorna muitos resultados

### Opção 2: Fuzzy Search no Backend (PostgreSQL) ✓ Recomendado
Usar a extensão `pg_trgm` do PostgreSQL para busca por similaridade.

**Vantagem**: Mais eficiente, busca fuzzy direto no banco
**Desvantagem**: Requer habilitar extensão e criar índice

---

## Implementação Detalhada (Opção 2)

### Parte 1: Habilitar pg_trgm no Banco

Criar migração SQL:
```sql
-- Habilitar extensão de trigram para fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Criar índice GIN para busca eficiente
CREATE INDEX IF NOT EXISTS profiles_display_name_trgm_idx 
ON profiles USING GIN (display_name gin_trgm_ops);

-- Criar função de busca com similaridade
CREATE OR REPLACE FUNCTION search_users_fuzzy(
  search_term TEXT,
  exclude_user_id UUID,
  max_results INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  similarity_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.display_name,
    p.avatar_url,
    similarity(LOWER(p.display_name), LOWER(search_term)) AS similarity_score
  FROM profiles p
  WHERE 
    p.id != exclude_user_id
    AND p.display_name IS NOT NULL
    AND (
      -- Busca por similaridade (tolera typos)
      similarity(LOWER(p.display_name), LOWER(search_term)) > 0.2
      OR
      -- Busca tradicional por substring
      LOWER(p.display_name) ILIKE '%' || LOWER(search_term) || '%'
    )
  ORDER BY 
    similarity(LOWER(p.display_name), LOWER(search_term)) DESC,
    p.display_name ASC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Parte 2: Atualizar Following.tsx

**Mudanças no componente:**

1. **Adicionar validação de mínimo de caracteres**
```typescript
const MIN_SEARCH_LENGTH = 3;

const handleSearch = async () => {
  // Validação de mínimo
  if (searchQuery.trim().length < MIN_SEARCH_LENGTH) {
    setSearchResults([]);
    return;
  }
  
  // Chamar função RPC com fuzzy search
  const { data } = await supabase.rpc('search_users_fuzzy', {
    search_term: searchQuery.trim(),
    exclude_user_id: currentUserId,
    max_results: 10
  });
  
  setSearchResults(data || []);
};
```

2. **Adicionar feedback visual**
```tsx
{searchQuery.length > 0 && searchQuery.length < MIN_SEARCH_LENGTH && (
  <p className="text-sm text-muted-foreground text-center py-4">
    {t("social.minCharacters")}
  </p>
)}
```

3. **Desabilitar botão de busca quando < 3 caracteres**
```tsx
<Button 
  onClick={handleSearch}
  disabled={searchQuery.trim().length < MIN_SEARCH_LENGTH}
>
  <Search className="h-4 w-4" />
</Button>
```

### Parte 3: Adicionar Traduções i18n

**Arquivo: `src/i18n/translations/en.ts`**
```text
social: {
  title: "Social",
  findPeople: "Find People",
  following: "Following",
  searchPlaceholder: "Search by name...",
  minCharacters: "Enter at least 3 characters to search",
  noResults: "No users found",
  notFollowing: "Not following anyone yet",
  notFollowingDesc: "Search for friends and family to follow their culinary adventures",
  viewPublicAlbums: "View public albums",
  follow: "Follow",
  unfollow: "Unfollow",
  nowFollowing: "Following!",
  nowFollowingDesc: "You are now following this user",
  unfollowed: "Unfollowed",
  unfollowedDesc: "You have unfollowed this user",
}
```

**Arquivo: `src/i18n/translations/pt.ts`**
```text
social: {
  title: "Social",
  findPeople: "Encontrar Pessoas",
  following: "Seguindo",
  searchPlaceholder: "Buscar por nome...",
  minCharacters: "Digite pelo menos 3 caracteres para buscar",
  noResults: "Nenhum usuário encontrado",
  notFollowing: "Ainda não segue ninguém",
  notFollowingDesc: "Busque por amigos e familiares para acompanhar suas aventuras culinárias",
  viewPublicAlbums: "Ver álbuns públicos",
  follow: "Seguir",
  unfollow: "Deixar de Seguir",
  nowFollowing: "Seguindo!",
  nowFollowingDesc: "Agora você está seguindo este usuário",
  unfollowed: "Deixou de Seguir",
  unfollowedDesc: "Você deixou de seguir este usuário",
}
```

---

## Fluxo do Usuário

```text
┌─────────────────────────────────────────────────┐
│ Usuário digita "fa"                             │
├─────────────────────────────────────────────────┤
│ ⚠️ "Digite pelo menos 3 caracteres para buscar" │
│     Botão de busca desabilitado                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Usuário digita "fau"                            │
├─────────────────────────────────────────────────┤
│ ✓ Busca ativada                                 │
│   → Encontra: "Fausto Moreira" (match exato)    │
│   → Encontra: "Fauto Silva" (typo tolerado!)    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Usuário digita "fasuto" (typo)                  │
├─────────────────────────────────────────────────┤
│ ✓ Fuzzy search encontra:                        │
│   → "Fausto Moreira" (similaridade 0.6)         │
└─────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| **Migração SQL** | Criar extensão pg_trgm + função RPC |
| `src/pages/Following.tsx` | Validação 3 chars + usar RPC fuzzy + i18n |
| `src/i18n/translations/en.ts` | Adicionar seção `social` |
| `src/i18n/translations/pt.ts` | Adicionar seção `social` |

---

## Comportamento Esperado

| Antes | Depois |
|-------|--------|
| Digitar "a" → 10+ usuários | Digitar "a" → mensagem de mínimo |
| Digitar "fasuto" → 0 resultados | Digitar "fasuto" → encontra "Fausto" |
| Sem feedback visual | Mensagem clara sobre requisitos |
| Todos os textos em inglês | Textos traduzidos PT/EN |

