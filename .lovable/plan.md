

# Plano: Corrigir Redirecionamento ao Fazer Sign Out

## Problema Identificado

Quando o usuário faz **sign out**, ele é redirecionado para a página "Digite o Código de Compartilhamento" (`/token`) em vez da tela de login.

### Causa Raiz

No arquivo `src/App.tsx`, a rota **legacy** para tokens de compartilhamento está posicionada incorretamente:

```typescript
// Linha 87 - PROBLEMA!
<Route path="/:token" element={<SharedByToken />} />

// Rotas protegidas (linha 90-113)
{!session ? (
  <Route path="*" element={<Auth />} />
) : (
  // ...rotas autenticadas
)}
```

**Fluxo do Bug:**
1. Usuário está em `/social`
2. Faz sign out → sessão é removida
3. React re-renderiza as rotas
4. A rota `/:token` captura `/social` (interpreta "social" como um token)
5. `SharedByToken` não valida "social" → redireciona para `/token`

### Por Que Isso Acontece?

A rota `/:token` é um **catch-all** para caminhos de um único segmento. Ela está posicionada **antes** da verificação de sessão, então captura qualquer rota não-protegida com um segmento.

---

## Solução

Mover a rota `/:token` para **dentro** da verificação de sessão, mas apenas no bloco de usuários **não autenticados**. Isso garante que:

1. Usuários autenticados usam as rotas normais (`/social`, `/dining`, etc.)
2. Usuários não autenticados que acessam um link de token (`/abc123xyz`) são redirecionados corretamente
3. Usuários não autenticados em qualquer outra rota veem a tela de login

---

## Mudanças no Código

### Arquivo: `src/App.tsx`

**Remover** a rota legacy da posição atual (linha 86-87):
```typescript
// REMOVER estas linhas:
{/* Legacy token route - LAST to avoid conflicts with other routes */}
<Route path="/:token" element={<SharedByToken />} />
```

**Adicionar** dentro do bloco de usuários não autenticados:
```typescript
{!session ? (
  <>
    {/* Legacy token route - only for unauthenticated users */}
    <Route path="/:token" element={<SharedByToken />} />
    <Route path="*" element={<Auth />} />
  </>
) : (
  // ... rotas autenticadas permanecem iguais
)}
```

---

## Estrutura Final das Rotas

```text
┌─────────────────────────────────────────────────────────┐
│ ROTAS PÚBLICAS (sempre acessíveis)                      │
├─────────────────────────────────────────────────────────┤
│ /share/:id      → SharedRestaurant                      │
│ /s/:token       → SharedByToken                         │
│ /token          → TokenInput                            │
│ /maps-debug     → MapsDebug                             │
│ /callback/apple → AppleCallback                         │
│ /albums         → Redirect para /dining?tab=albums      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SE NÃO AUTENTICADO                                      │
├─────────────────────────────────────────────────────────┤
│ /:token         → SharedByToken (legacy tokens)         │
│ *               → Auth (tela de login)                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ SE AUTENTICADO                                          │
├─────────────────────────────────────────────────────────┤
│ /               → Index                                 │
│ /dining         → Dining                                │
│ /social         → Following                             │
│ ...outras rotas protegidas...                           │
│ *               → NotFound                              │
└─────────────────────────────────────────────────────────┘
```

---

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/App.tsx` | Mover rota `/:token` para dentro do bloco `!session` |

---

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| Sign out em `/social` → vai para `/token` | Sign out em `/social` → vai para tela de Login |
| Rota `/:token` captura rotas protegidas | Rota `/:token` só funciona para não-autenticados |

---

## Seção Técnica

A ordem das rotas no React Router é importante. Rotas mais específicas devem vir antes de rotas genéricas. A rota `/:token` é extremamente genérica (captura qualquer segmento único) e estava "vazando" para rotas que deveriam ser protegidas.

Ao mover para dentro do bloco condicional, garantimos que:
- Usuários autenticados nunca "batem" na rota `/:token`
- Usuários não autenticados acessando `/social` vão para Auth (login)
- Usuários não autenticados acessando `/abc123` (token real) vão para SharedByToken

