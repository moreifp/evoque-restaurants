

# Force EULA Agreement for Existing Users

Existing users who signed up before the EULA was implemented need to explicitly accept the new terms before continuing to use the app.

---

## How It Works

1. A new column `terms_accepted_at` is added to the `profiles` table (nullable timestamp, defaults to NULL)
2. New sign-ups already agree during registration, so their profile gets `terms_accepted_at = now()` at creation
3. For existing users where `terms_accepted_at IS NULL`, a full-screen modal appears after login -- they cannot dismiss it or use the app until they agree
4. Once they check the box and confirm, their profile is updated with the current timestamp

---

## User Experience

- Existing user logs in normally
- A blocking modal appears: "We've updated our Terms of Use"
- Shows links to Terms of Use and Privacy Policy
- Checkbox: "I agree to the Terms of Use and Privacy Policy"
- "Continue" button (disabled until checked)
- No way to close or navigate away -- the modal blocks the entire app
- After accepting, modal disappears and they can use the app normally

---

## Technical Details

### Database Migration
- Add `terms_accepted_at TIMESTAMPTZ DEFAULT NULL` to the `profiles` table
- For brand-new users going forward, the sign-up flow in `Auth.tsx` and `useAuthProfile.ts` will set this column on profile creation

### New Component: `TermsAcceptanceGate`
- Wraps all authenticated routes in `App.tsx`
- Queries the user's profile for `terms_accepted_at`
- If NULL, renders a full-screen overlay with the EULA agreement
- On acceptance, updates the profile and removes the overlay

### Files to Create/Modify

| File | Change |
|---|---|
| Database migration | Add `terms_accepted_at` column to `profiles` |
| `src/components/TermsAcceptanceGate.tsx` | NEW -- blocking modal for terms acceptance |
| `src/App.tsx` | Wrap authenticated routes with `TermsAcceptanceGate` |
| `src/components/Auth.tsx` | Set `terms_accepted_at` on email sign-up |
| `src/hooks/useAuthProfile.ts` | Set `terms_accepted_at` on OAuth profile creation |

