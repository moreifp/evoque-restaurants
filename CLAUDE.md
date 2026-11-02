# Evoque Restaurants — regras para trabalhar neste repositório

- Português do Brasil em tudo (código, telas, commits, explicações).
- Feito só com o Claude. O projeto saiu do Lovable em out/2026.
- Telas: poucos cliques, pouco texto, ícones grandes, navegação óbvia. Não mudar o visual sem o Fausto pedir.
- Nunca gravar chave, senha ou token no código nem no git. O front usa só chaves publicáveis (`.env` local, fora do git — modelo em `.env.example`; no Cloudflare, nas variáveis de build); as secretas ficam nos secrets do Supabase.
- Toda mudança numa branch nova + PR; merge na `main` quando o Fausto mandar. Ele testa no iPhone e no Mac.

## Onde roda
- **App:** https://restaurantes.evoque.global — é o único endereço do app. O GitHub Pages (`moreifp.github.io/evoque-restaurants`) e o link antigo do Lovable **não** são o app.
- **Front:** Cloudflare Workers: SPA estática de `dist/` + `worker/index.ts` (só a rota `/api/nfce`) — `wrangler.jsonc`. O Workers Builds está ligado ao GitHub: **todo merge na `main` publica sozinho** (~2 min). Para forçar um build, basta um commit novo na `main`.
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

## QR code no cardápio e no recibo (`src/lib/qrLink.ts`, função `read-qr-link`, `worker/index.ts`)
- Não há botão novo: a foto de **Cardápio** ou **Recibo** é examinada por dois leitores: **ZXing** (`zxing-wasm`, WebAssembly servido pelo app — `zxing_reader.wasm?url`, carregado só na 1ª foto; 1600/1000 px, `tryHarder`/`tryInvert`/`tryRotate`) e, de reserva, `jsqr` (1000/800/1400/600 px, `inversionAttempts: "attemptBoth"`). Achou link web → lê o link; senão, ou se o link falhar, lê a foto como antes. Durante a leitura pelo link a tela mostra "QR code encontrado · lendo o cardápio do link (até 1 min)" — um PDF de 6 páginas leva ~50 s.
- Pontos que usam: `draftEngine.runAi` (cadastro), `UnifiedMediaUpload` (edição: recibo e "Traduzir") e `RestaurantDetail.handleTranslateMenu`. Sempre por `translateMenuSmart` / `processReceiptSmart`.
- **Cardápio:** `read-qr-link` abre página web (texto + segue até 2 links de PDF/Drive), PDF, imagem, arquivo ou **pasta pública do Google Drive** (`embeddedfolderview`) e Google Docs; traduz com o mesmo formato do `translate-menu`. O link fica na legenda (`caption`) da foto e aparece o selo "Lido pelo QR code · Abrir original". Cardápios que só montam com JavaScript (apps de cardápio digital) não abrem → cai na foto.
- **Recibo (NFC-e):** a Sefaz-SP **bloqueia servidores de nuvem** — testado em 02/11/2026: Amazon (funções e banco do Supabase) **e também o Cloudflare** (`/api/nfce` recebe a página "Request Rejected"). Só abre no aparelho da pessoa (exige `|` como `%7C` e User-Agent de navegador). Hoje, com NFC-e, o recibo cai na leitura da foto. `/api/nfce` (Worker, só domínios de Sefaz) ficou no app: pode servir para outros estados. Ideia em aberto: favorito do Safari "Enviar ao Evoque" que manda o texto da nota do próprio celular. CPF/nome do consumidor sempre retirados antes da IA.
- Segurança do `read-qr-link`: exige login, recusa endereços internos/privados, confere cada redirecionamento, limite de 20 MB e 20 s.

## Nota fiscal pelo favorito "Enviar ao Evoque" (`src/lib/nfceSend.ts`, `NotaRecebida.tsx`, função `receive-nfce`)
- Como a Sefaz só abre a nota no celular da pessoa, quem lê a página é um **favorito do Safari** (bookmarklet com a chave pessoal): tira linhas de CPF e abre `/nota#k=<chave>&u=<link>&t=<texto>`.
- `/nota` (rota pública, sem login) apaga o `#` da barra, manda para `receive-nfce` (sem JWT; a chave identifica a pessoa; 20 notas/hora), que lê os itens com Haiku e grava em `pending_receipts`.
- O app pega a nota com `usePendingNota` (ao abrir a tela, ao voltar ao app e a cada 8 s): no **cadastro**, vira o Recibo do rascunho (imagem "recibo digital" gerada em canvas + itens, sem IA de novo); no **restaurante salvo**, só se a visita é de hoje/ontem, substitui o recibo. Notas valem 3 h. Depois de usada: `status = 'used'`.
- Tabelas: `nfce_send_keys` (uma chave por pessoa; trocar a chave em Conta invalida o favorito antigo) e `pending_receipts`.
- Configuração: Conta → "Nota fiscal pelo QR" (`NotaFavoritoCard`): copiar código + 3 passos. No cadastro, recibo com QR de NFC-e não lido mostra "Abrir nota" (`NfceHint`).

## Tradução do cardápio: "Só os pratos" | "Com explicação"
- `withoutExplanations` (`src/lib/menuText.ts`) tira as linhas "(...)" de explicação (inclusive em mais de uma linha) e notas `>`. Padrão: só os pratos, com fonte maior. Preferência no aparelho (`useMenuExplain`, localStorage). Vale no cadastro, no restaurante e na foto ampliada. O PDF do Compartilhar leva a tradução completa.

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
