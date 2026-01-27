
# Plano: Suporte a Múltiplos Domínios no Apple Sign In

## Situação Atual
O Apple Sign In funciona em `evoquebyfausto.lovable.app` mas não em `food.evoque.guru` porque:
1. O domínio não está registrado no Apple Developer Console
2. O código tem o redirect URI fixo (hardcoded)

## Ações Necessárias

### Parte 1: Configuração no Apple Developer Console (você faz)
1. Acesse **Certificates, Identifiers & Profiles → Identifiers**
2. Clique no Service ID `app.lovable.385321039a9345e2934908e3a7564453.appleauth`
3. Clique em **Configure** ao lado de "Sign in with Apple"
4. Adicione em **Domains and Subdomains**: `food.evoque.guru`
5. Adicione em **Return URLs**: `https://food.evoque.guru/callback/apple`
6. Salve as alterações

### Parte 2: Atualização do Código (eu faço)

#### Arquivo: `src/hooks/useAppleAuth.ts`
- Remover o `REDIRECT_URI` fixo
- Detectar o domínio atual usando `window.location.origin`
- Gerar dinamicamente: `${window.location.origin}/callback/apple`

#### Arquivo: `supabase/functions/apple-auth-callback/index.ts`
- O código já aceita `redirect_uri` como parâmetro (linha 88 e 129)
- Apenas garantir que o fallback use o valor correto quando não fornecido

## Detalhes Técnicos

### Mudança no useAppleAuth.ts
```text
Antes:
const REDIRECT_URI = "https://evoquebyfausto.lovable.app/callback/apple";

Depois:
const getRedirectUri = () => `${window.location.origin}/callback/apple`;
```

### Fluxo de Autenticação Atualizado
```text
Usuário clica "Sign in with Apple"
          ↓
Hook detecta domínio atual (food.evoque.guru ou evoquebyfausto.lovable.app)
          ↓
Apple popup abre com redirect_uri correto
          ↓
Usuário autoriza
          ↓
Edge Function recebe redirect_uri dinâmico e processa
          ↓
Sessão criada com sucesso
```

## Resultado Esperado
- Apple Sign In funcionará em todos os domínios configurados no Apple Developer Console
- Nenhuma mudança de código necessária ao adicionar novos domínios no futuro (apenas configurar na Apple)
