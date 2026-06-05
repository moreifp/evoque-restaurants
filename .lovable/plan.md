# Preview rico ao compartilhar restaurante

Hoje qualquer link `/share/:entryId` ou `/s/:token` enviado no WhatsApp/iMessage/Instagram mostra o card genérico do Evoque, porque o app é uma SPA e os bots não executam JS — só leem o `index.html` estático. Vamos servir HTML com meta tags Open Graph dinâmicas + uma imagem 1200×630 gerada on-the-fly com a foto do restaurante e overlay branded.

## Resultado

Quando alguém colar o link no WhatsApp/iMessage/Slack/Twitter/LinkedIn, verá:

```text
┌─────────────────────────────────────────┐
│                                         │
│   [foto do restaurante em fundo]        │
│                                         │
│   TEN CON TEN                           │
│   ★★★★☆ · Madrid                        │
│                                         │
│   Compartilhado por Fausto · evoque    │
└─────────────────────────────────────────┘
Veja o restaurante Ten con Ten
Madrid · 4.5 ★ · por Fausto
food.evoque.guru
```

## Arquitetura

```text
WhatsApp bot → GET /share/abc123
        │
        ▼
Lovable hosting (SPA fallback)
        │  (sem SSR — bot recebe index.html genérico hoje)
        ▼
NOVO: edge function `share-preview` exposta em URL pública,
linkada a partir do index.html via roteamento por User-Agent

OU (preferido): redirect na própria rota /share/:id se UA = bot
```

Como Lovable hosting não permite middleware de UA, a abordagem limpa é:

1. Edge function `share-og` retorna **HTML completo com meta tags** quando chamada com `?entry_id=...` ou `?token=...`. Inclui `<meta http-equiv="refresh">` para usuários humanos que caírem nela voltarem ao SPA.
2. Edge function `share-og-image` retorna **PNG 1200×630** gerado com Satori + resvg-wasm.
3. Atualizar o **link compartilhado** para apontar para a edge function (`https://<project>.supabase.co/functions/v1/share-og?token=xyz`) em vez de `food.evoque.guru/s/xyz`. A função, ao detectar navegador humano, redireciona via 302 para a URL real do SPA; bots leem as meta tags e param ali.

Trade-off: o domínio que aparece no preview muda de `food.evoque.guru` para o domínio Supabase. Para manter o domínio bonito, alternativa é criar um Worker/proxy no domínio custom — mas isso fica fora do escopo Lovable. Recomendação: aceitar o domínio Supabase no link curto (já é opaco — `/s/k3m9p2x7n4`) e seguir adiante.

## Mudanças

### Backend

**Nova edge function `share-og`** (`supabase/functions/share-og/index.ts`)
- Aceita `?entry_id=<uuid>` ou `?token=<token>`.
- Se `token`: chama lógica equivalente ao `validate-share-token` para obter `entry_id`.
- Busca via service role:
  - `restaurant_entries`: `restaurant_name`, `city`, `rating`, `user_id`.
  - `restaurant_photos` (1ª foto não-receipt, ordem: capa do entry → `type='food'` → qualquer): `photo_url`.
  - `profiles`: `display_name`, `language_preference` (idioma do dono).
- Detecta User-Agent: se for bot conhecido (`facebookexternalhit`, `WhatsApp`, `Twitterbot`, `Slackbot`, `LinkedInBot`, `Discordbot`, `TelegramBot`, `iMessage`, `Skype`, `Applebot`), retorna HTML com meta tags. Caso contrário, 302 redirect para `https://food.evoque.guru/share/<entry_id>`.
- HTML inclui:
  - `<title>` traduzido (PT: "Veja o restaurante X" / EN: "Check out X").
  - `<meta name="description">` com cidade · rating · "por <autor>".
  - `og:title`, `og:description`, `og:type=website`, `og:url`, `og:image` → aponta para `share-og-image?entry_id=...`.
  - `twitter:card=summary_large_image`, `twitter:image`.
  - `<meta http-equiv="refresh" content="0; url=https://food.evoque.guru/share/<id>">` como fallback se um humano abrir.

**Nova edge function `share-og-image`** (`supabase/functions/share-og-image/index.ts`)
- Aceita `?entry_id=<uuid>`.
- Busca mesmos dados (nome, cidade, rating, autor, 1ª foto).
- Baixa a foto, faz fetch para Uint8Array.
- Renderiza com **Satori** (`npm:satori@0.10`) um JSX-like layout 1200×630:
  - Foto como background com gradient overlay escuro embaixo.
  - Nome do restaurante (font grande, branca).
  - Linha de meta: `★ rating · cidade`.
  - Rodapé: `Compartilhado por <autor> · Evoque`.
  - Logo Evoque pequeno no canto.
- Converte SVG → PNG com **resvg-wasm** (`npm:@resvg/resvg-wasm@2`).
- Retorna `image/png` com `Cache-Control: public, max-age=86400, s-maxage=86400`.
- Fallback se não houver foto: gradient verde-oliva do brand + nome do restaurante centralizado.
- Fonte: usa Inter via fetch a `https://fonts.googleapis.com/...` no cold-start, cacheado em memória do isolate.

Ambas funções: `verify_jwt = false` em `supabase/config.toml`, CORS aberto.

### Frontend

**`src/lib/shareUrl.ts`** (novo helper)
- `getShareUrl(entryId, token?)` retorna a URL pública apropriada:
  - Com token: `https://<project>.supabase.co/functions/v1/share-og?token=<token>`.
  - Sem token: `https://<project>.supabase.co/functions/v1/share-og?entry_id=<id>`.
- Centraliza a construção do link.

**Atualizar pontos de compartilhamento** para usar o helper:
- `src/pages/RestaurantDetail.tsx` — botão Compartilhar.
- Qualquer outro lugar que monte URL `/share/` ou `/s/` para enviar a terceiros (busca por `share/` e `/s/` no codebase confirmará).
- Links internos do app (ex: navegação dentro do próprio Evoque) continuam usando rotas SPA — só o link que o usuário envia muda.

### Privacidade (5 campos confirmados)

O preview expõe somente: `restaurant_name`, `city`, `rating`, 1 foto não-receipt, `display_name` do autor. **Excluído explicitamente**: notas privadas, fotos de receipt (`type='receipt'`), valor da conta, itens da conta, tags privadas. A função filtra `type != 'receipt'` ao buscar foto.

Se o entry tiver `profile_visibility='private'` no dono, a função retorna preview minimalista só com "Restaurante compartilhado · Evoque" + logo, sem nome nem autor.

## Detalhes técnicos

- **Satori + resvg-wasm em Deno edge**: padrão estabelecido, ~300ms cold / ~80ms warm para 1200×630. Não precisa de Puppeteer.
- **Cache**: `share-og-image` é determinístico por `entry_id`; cache de 24h cobre o caso comum de link reenviado.
- **Idioma**: lido de `profiles.language_preference` do dono (ou fallback `pt`). Não depende do destinatário.
- **i18n strings** novas em `src/i18n/translations/{pt,en}.ts`: `share.preview.title`, `share.preview.description` — usadas só pela edge function (que importa as strings hardcoded; não compartilha arquivo com frontend).
- **Bot detection**: regex simples em UA, sem libs externas.
- **Memory updates**: criar `mem://feature/share-link-preview` documentando arquitetura e os 5 campos públicos; atualizar `mem://feature/receipts-private-security` se já não cobrir explicitamente a exclusão no preview.

## Fora de escopo

- Manter `food.evoque.guru` como domínio visível no preview (exigiria proxy fora do Lovable).
- Preview para álbuns compartilhados (`/album/...`) — pode vir num passo seguinte com a mesma arquitetura.
- Analytics de clicks no preview (já existe `share_tokens.clicks` para links com token).

## Validação

1. Compartilhar um restaurante público no WhatsApp Web → confirmar card com foto + nome + cidade + rating + autor.
2. Testar no [opengraph.dev](https://www.opengraph.dev/) e no [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/).
3. Abrir o link num navegador real → confirmar redirect 302 para o SPA.
4. Compartilhar entry sem foto → confirmar fallback gradient + nome.
5. Compartilhar entry de perfil privado → confirmar preview minimalista sem nome/autor.
6. Confirmar que fotos de receipt nunca aparecem na imagem gerada.
