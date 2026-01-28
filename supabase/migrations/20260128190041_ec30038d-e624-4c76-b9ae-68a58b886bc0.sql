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