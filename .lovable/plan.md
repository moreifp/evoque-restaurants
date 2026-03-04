

## Fix: Apple Sign In Not Working on iPad (Apple Review Rejection 2.1a)

### Root Cause Analysis

The app uses `lovable.auth.signInWithOAuth("apple")` which performs a **full-page redirect** to Apple's OAuth provider. Inside the Despia webview on iPad, this redirect either silently fails or the return callback (`/~oauth`) doesn't get processed properly, resulting in "no further action" after tapping the button.

The old custom Apple auth implementation (`useAppleAuth.ts`, `AppleCallback.tsx`, `apple-auth-callback` edge function) still exists in the codebase but is no longer used -- it was replaced by the managed Lovable Cloud OAuth. However, the managed OAuth redirect flow may not work reliably inside native webviews.

### Plan

**Step 1: Add diagnostic logging to Apple Sign In**
- In `Auth.tsx`, wrap `handleAppleSignIn` with detailed console logging at every step (before call, after result, error details)
- This will help capture exactly where the flow breaks on iPad

**Step 2: Implement native-aware Apple Sign In fallback**
- When running inside Despia (`isNative === true`), use **Apple's native JS SDK popup flow** (the old `useAppleAuth.ts` approach) instead of the Lovable Cloud redirect flow
- The popup flow works better in webviews because it doesn't require a full-page redirect
- Keep the Lovable Cloud managed OAuth for web/PWA users (non-native)

**Step 3: Update Auth.tsx with conditional flow**
- If `isNative`: use `useAppleAuth().signInWithApple()` (popup-based, uses the existing edge function)
- If web/PWA: use `lovable.auth.signInWithOAuth("apple")` (redirect-based, current behavior)

**Step 4: Ensure the edge function `apple-auth-callback` still works**
- Verify the edge function has the required secrets (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`)
- The edge function is already deployed and handles token exchange + session creation

**Step 5: Add iPad-specific error handling**
- Show a user-visible toast if Apple Sign In fails silently (no action detected after timeout)
- Add a retry mechanism

### Files to Change
- `src/components/Auth.tsx` -- conditional Apple auth based on `isNative`
- `src/hooks/useAppleAuth.ts` -- no changes needed (already functional)
- Potentially clean up `src/pages/AppleCallback.tsx` route (keep for redirect fallback)

### Technical Details
- The old Apple popup flow uses Apple's JS SDK (`appleid.auth.js`) loaded dynamically
- It calls the `apple-auth-callback` edge function to exchange the authorization code for a session
- This approach avoids the full-page redirect that breaks in iPad webviews
- Existing secrets (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`) must be configured for this to work

