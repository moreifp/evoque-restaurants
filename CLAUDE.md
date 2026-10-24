# Evoque Restaurants — regras para trabalhar neste repositório

- Português do Brasil em tudo (código, telas, commits, explicações).
- Feito só com o Claude. O projeto saiu do Lovable em out/2026.
- Telas: poucos cliques, pouco texto, ícones grandes, navegação óbvia. Não mudar o visual sem o Fausto pedir.
- Nunca gravar chave, senha ou token no código nem no git. O front usa só chaves publicáveis (`.env`, fora do git — modelo em `.env.example`); as secretas ficam nos secrets do Supabase.
- Toda mudança numa branch nova; a `main` só recebe merge depois de testar.

## Onde roda
- Front: Cloudflare Workers, SPA estática de `dist/` (`wrangler.jsonc`).
- Banco, auth, storage e edge functions: Supabase próprio do Fausto (`supabase/`).
- Edge functions (`supabase/functions/`): IA (Anthropic) para nota do restaurante, rótulo de vinho, recibo e cardápio; áudio (ElevenLabs); mapas (Google Places); backup no Google Drive; compartilhamento por token; integração com o Evoque Viagens (`embed-exchange`, `my-trips`).
- Admin: função `admin-dashboard`, liberada por lista de e-mails dentro da própria função.
- Secrets usados pelas functions: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ELEVENLABS_API_KEY`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_DRIVE_*`, `RESEND_API_KEY`, `EVOQUE_VIAGENS_*`, `CRON_SECRET`.

## Pontos de atenção
- `src/pages/RestaurantDetail.tsx` (~2.000 linhas) e `AddRestaurant.tsx` (~1.150) concentram quase tudo — mexer com cuidado e testar no iPhone.
- Não há testes automatizados ainda; `src/lib` e `src/utils` são os primeiros candidatos.
