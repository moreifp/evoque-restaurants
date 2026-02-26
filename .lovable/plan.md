

# AI Consent & Disclosure System (Apple Guideline 5.1.1(i) / 5.1.2(i))

## Summary

A consent system that gates every AI call behind explicit user permission, with per-scope disclosure of what data is sent to Google Gemini (Google LLC). Users can grant/withdraw consent at any time from Settings.

---

## Database Changes

### Migration 1: Add AI consent columns to `profiles`

```sql
ALTER TABLE public.profiles
  ADD COLUMN ai_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_consent_timestamp timestamptz,
  ADD COLUMN ai_consent_version text DEFAULT '2026-02-26',
  ADD COLUMN ai_consent_scopes text[] DEFAULT '{}';
```

### Migration 2: Create `ai_consent_logs` table

```sql
CREATE TABLE public.ai_consent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL,
  allowed boolean NOT NULL,
  policy_version text NOT NULL DEFAULT '2026-02-26',
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_consent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own consent logs"
  ON public.ai_consent_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own consent logs"
  ON public.ai_consent_logs FOR SELECT
  USING (auth.uid() = user_id);
```

---

## New Components

### 1. `src/hooks/useAIConsent.ts` — Central consent logic

- Exports `ensureAIConsent(scope: string): Promise<boolean>`
- Checks profile for `ai_consent === true` AND (scopes contains scope OR scopes is empty)
- If consent already granted for scope, returns `true` immediately
- If not, opens the AI Consent Modal and returns a promise that resolves when user decides
- On "Allow": updates profile (`ai_consent=true`, timestamp, version, adds scope), logs to `ai_consent_logs`, resolves `true`
- On "Not now": logs refusal, shows toast "AI is off. You can enable it anytime in Settings.", resolves `false`
- Uses a React context or global event emitter to trigger the modal

### 2. `src/components/AIConsentModal.tsx` — Reusable modal

- Full-screen dialog (non-dismissible by clicking outside)
- Dynamic title/body based on scope parameter
- Scope copy as specified:
  - `wine_recognition`: wine photo + notes → Google Gemini
  - `menu_translation`: menu photo → Google Gemini
  - `invoice_transcription`: invoice photo → Google Gemini
  - `recommendations`: dining history/preferences → Google Gemini
- Link to Privacy Policy (https://evoque.guru/privacy-policy)
- Two buttons: "Allow AI for this feature" / "Not now"
- Bilingual (EN/PT) using i18n

### 3. `src/contexts/AIConsentContext.tsx` — Context provider

- Wraps the app, provides `ensureAIConsent(scope)` function
- Manages modal open/close state and pending promise resolution
- Caches user consent state from profiles table

---

## Gating AI Calls (6 call sites)

Each AI call site will be wrapped: call `ensureAIConsent(scope)` first, proceed only if `true`.

| Call Site | File | Scope |
|---|---|---|
| Wine label analysis | `UnifiedMediaUpload.tsx` → `analyzeWineLabel()` | `wine_recognition` |
| Wine label analysis | `WineUpload.tsx` → `analyzeWineLabel()` | `wine_recognition` |
| Receipt processing | `UnifiedMediaUpload.tsx` → `processReceipt()` | `invoice_transcription` |
| Menu translation | `UnifiedMediaUpload.tsx` → `handleTranslateMenuLocal()` | `menu_translation` |
| Menu translation | `RestaurantDetail.tsx` → `handleTranslateMenu()` | `menu_translation` |
| Restaurant note gen | `RestaurantDetail.tsx` → `handleGenerateNote()` | `recommendations` |
| Restaurant description | `AddRestaurant.tsx` → generate description | `recommendations` |
| AI planner | `AgendaAIPlannerTab.tsx` → `handleStartPlanning()` | `recommendations` |
| Plan refine | `PlanDetail.tsx` → refine call | `recommendations` |

Pattern for each:

```typescript
const allowed = await ensureAIConsent("wine_recognition");
if (!allowed) return; // user refused, exit gracefully
// ... existing AI call
```

---

## Settings Page — Privacy → AI Features

Add a new Card in `Account.tsx` (between Preferences and Legal sections):

- Title: "AI Features" with Brain/Sparkles icon
- Explanatory paragraph about Google Gemini
- Toggle: "Allow AI features (Google Gemini)" — maps to `ai_consent`
- When toggled OFF: sets `ai_consent=false`, clears `ai_consent_scopes`, logs `withdraw_all`
- When toggled ON: sets `ai_consent=true`, sets timestamp/version
- "Withdraw all consent" button (destructive) — same as toggling off
- Lists currently granted scopes as badges

---

## Privacy Policy Link Placement

- Already present in Auth.tsx (sign-up form) ✓
- Already present in Account.tsx (Legal section) ✓
- Add to AI Consent Modal (part of the modal body) — new
- Add footer link in Auth.tsx login view (currently only in sign-up) — update Auth.tsx

---

## Fallback When Consent Refused

No code changes needed for basic fallback — when `ensureAIConsent()` returns false, the function simply returns early. The manual entry fields (wine name, notes, receipt total) already exist in the UI. The AI buttons just won't execute.

---

## Files to Create/Modify

| File | Action |
|---|---|
| Database migration | NEW — add columns + create table |
| `src/contexts/AIConsentContext.tsx` | NEW — context + modal state management |
| `src/components/AIConsentModal.tsx` | NEW — disclosure modal |
| `src/hooks/useAIConsent.ts` | NEW — `ensureAIConsent()` hook |
| `src/App.tsx` | Wrap with `AIConsentProvider` |
| `src/components/UnifiedMediaUpload.tsx` | Gate 3 AI calls |
| `src/components/WineUpload.tsx` | Gate 1 AI call |
| `src/pages/RestaurantDetail.tsx` | Gate 2 AI calls |
| `src/pages/AddRestaurant.tsx` | Gate 1 AI call |
| `src/components/agenda/AgendaAIPlannerTab.tsx` | Gate 1 AI call |
| `src/pages/PlanDetail.tsx` | Gate 1 AI call |
| `src/pages/Account.tsx` | Add AI Features privacy section |
| `src/components/Auth.tsx` | Add Privacy Policy link to login footer |
| `src/i18n/translations/en.ts` | Add AI consent strings |
| `src/i18n/translations/pt.ts` | Add AI consent strings (PT) |

