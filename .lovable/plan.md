# Open Evoque Restaurants inside Evoque Viagens (embedded sign-in)

## Goal
Evoque Viagens opens Restaurants in an embedded frame. The user is recognized automatically via a one-time sign-in pass, with no second login.

## Flow
```text
Viagens (logged in) --> asks its backend for a signed pass (user email, expiry 60s, unique id)
   --> opens frame: food.evoque.guru/embed?pass=...
Restaurants /embed page --> sends pass to its backend
   --> backend checks signature, expiry, not used before, marks as used
   --> finds or creates the user by email, returns a session
   --> page signs in and shows the app (embedded mode)
```

## Steps
1. **Copy the Timão approach first.** Open the Timão project and read its embedded sign-in code (pass format, signing, session creation, frame settings). Mirror it as closely as possible.
2. **Record used passes.** New private table storing each pass id and time used; a pass used twice or expired is refused.
3. **Backend check function** (public, no login required): verifies the signature with the shared secret for Evoque Viagens, enforces expiry (max ~2 min), single use, and allowed origin; finds or creates the Restaurants account by verified email; returns a session.
4. **New `/embed` page** in Restaurants: reads the pass, calls the check, signs in, removes the pass from the address bar, then opens home. Invalid pass shows a clear bilingual (PT/EN) error.
5. **Embedded mode tweaks:** hide install prompts/splash when inside the frame; terms acceptance and AI consent still apply to new users.
6. **Allow framing only by Evoque Viagens** (its web address) so other sites can't embed Restaurants.
7. **Secrets:** a secure form asks you for the shared password (same one saved in Viagens). I'll give you the connection ID and confirm the address `food.evoque.guru`.
8. **Test** with a throwaway account: valid pass works, reused pass fails, expired pass fails.

## What you need to do
- Create one strong random password (password manager) and keep it for both apps.
- After approval, paste it into the secure form here, then pass the ID + address to Viagens.

## Technical details
- Pass: HMAC-SHA256 signed token `{sub_email, iat, exp, jti, aud:"evoque-restaurants", iss:"evoque-viagens"}`; secret `EVOQUE_VIAGENS_EMBED_SECRET`, id `EVOQUE_VIAGENS_CLIENT_ID`.
- Table `embed_pass_uses(jti text primary key, used_at timestamptz)`; RLS on, service role only; insert-on-conflict rejects reuse.
- Edge function `embed-exchange` (verify_jwt=false): constant-time signature compare, admin generateLink/magic-link verify to mint session, returns tokens to `supabase.auth.setSession`.
- Public route `/embed` added before the auth guard in App.tsx.
- Frame auth storage: iOS/Safari may block third-party storage in frames; Timão's handling will be copied (e.g. in-memory session fallback).
