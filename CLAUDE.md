# Evoque Restaurants — regras para trabalhar neste repositório

- Português do Brasil em tudo (código, telas, commits, explicações).
- Feito só com o Claude. O projeto saiu do Lovable em out/2026.
- Telas: poucos cliques, pouco texto, ícones grandes, navegação óbvia. Não mudar o visual sem o Fausto pedir.
- Nunca gravar chave, senha ou token no código nem no git. O front usa só chaves publicáveis (`.env` local, fora do git — modelo em `.env.example`; no Cloudflare, nas variáveis de build); as secretas ficam nos secrets do Supabase.
- Toda mudança numa branch nova + PR; merge na `main` quando o Fausto mandar. Ele testa no iPhone e no Mac.

## Onde roda
- **App:** https://restaurantes.evoque.global — é o único endereço do app. O GitHub Pages (`moreifp.github.io/evoque-restaurants`) e o link antigo do Lovable **não** são o app.
- **Front:** Cloudflare Workers, SPA estática de `dist/` (`wrangler.jsonc`). O Workers Builds está ligado ao GitHub: **todo merge na `main` publica sozinho** (~2 min). Para forçar um build, basta um commit novo na `main`.
- **Variáveis de build no Cloudflare** (Settings → Builds → Variables and secrets): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. Sem elas o app abre o logo e fica em tela branca.
- **Banco, auth, storage e edge functions:** Supabase próprio do Fausto, projeto `evoque-restaurants` (`qmbmifmqnkkiwlshcjzm`), pasta `supabase/`.
- **Edge functions** (`supabase/functions/`): IA (Anthropic) para nota do restaurante, rótulo de vinho, recibo e cardápio; áudio (ElevenLabs); mapas (Google Places); backup no Google Drive; compartilhamento por token; integração com o Evoque Viagens (`embed-exchange`, `my-trips`).
- **Admin:** função `admin-dashboard`, liberada por lista de e-mails dentro da própria função.
- **Secrets das functions:** `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ELEVENLABS_API_KEY`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_DRIVE_*`, `RESEND_API_KEY`, `EVOQUE_VIAGENS_*`, `CRON_SECRET`.

## Tela do restaurante (`src/pages/RestaurantDetail.tsx`)
- Seções **Lugar, Comida, Cardápio, Vinho, Amigos, Vídeos e Recibo** são recolhíveis (setinha), começam fechadas e mostram a quantidade de fotos. Estado em `openSections`.
- A **tradução do cardápio** de cada foto também é recolhível (abre sozinha ao editar).
- No fim da tela, botão grande **Compartilhar** → folha `src/components/share/ShareSheet.tsx`.

## Compartilhar (`ShareSheet.tsx`, `src/lib/sharePack.ts`, `src/lib/pdfText.ts`)
- Folha com nome e endereço, 6 bolinhas (Lugar, Cardápio, Comida, Vinho, Amigos, Recibo) que **começam desmarcadas**; bolinha sem foto fica apagada. Embaixo, botões **PDF** e **WhatsApp**.
- **WhatsApp no iPhone/Android:** `navigator.share` com as fotos + texto (nome, endereço, data, nota) → folha nativa → WhatsApp → um ou mais contatos.
- **WhatsApp no computador:** a folha do Mac não lista o WhatsApp para arquivos. Então gera o PDF, sobe para `restaurant-photos/<uid>/compartilhados/<aleatório>/` e abre `whatsapp://send` com o texto e **um link só** (cai no WhatsApp Web se o app não abrir). Um link por foto não serve: o WhatsApp só mostra a prévia do primeiro.
- **PDF:** A4 com cabeçalho, fotos por seção (duas por linha) e, se o Cardápio estiver marcado e houver tradução, um **anexo no fim** com a tradução formatada, link "Ver tradução do cardápio »" na seção e índice lateral. Gerado no aparelho com `jspdf`.
- As fontes padrão do PDF só têm o alfabeto latino: `pdfSafe` tira emojis; a nota sai como "4/5" (a estrela não existe na fonte).

## Lições aprendidas
- **Safari e cache:** foto que a tela já mostrou em tamanho cheio (via `srcSet`, sem CORS) faz o `fetch` com CORS da mesma URL falhar no iPhone. `fetchAsFile` (`src/lib/saveToPhotos.ts`) baixa com parâmetro extra na URL e `cache: "no-store"`. Não remover.
- O iPhone exige o gesto do usuário para `navigator.share`: as fotos são pré-baixadas enquanto se escolhem as bolinhas.
- Falha ao baixar foto não pode ser silenciosa: o compartilhar avisa quantas ficaram de fora.

## Pontos de atenção
- `src/pages/RestaurantDetail.tsx` (~2.000 linhas) e `AddRestaurant.tsx` (~1.150) concentram quase tudo — mexer com cuidado e testar no iPhone.
- O lint tem ~18 avisos antigos (`any` sem tipo) herdados do Lovable em `RestaurantDetail.tsx`; não afetam o app. Mudanças novas não devem criar avisos novos.
- Não há testes automatizados ainda; `src/lib` e `src/utils` são os primeiros candidatos (`pdfText.ts` é puro e fácil de testar).
- Clone raso: se o `git` não enxergar a branch remota, `git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*" && git fetch`.

## Versões
- `final-2026-10-10` — antes do teste com dados reais.
- `final-2026-10-26` — compartilhar (PDF/WhatsApp no iPhone e no Mac), seções recolhíveis, tradução do cardápio no PDF, deploy automático pelo Cloudflare.
