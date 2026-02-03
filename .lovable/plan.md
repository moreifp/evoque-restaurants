
# Fix: Redirect to Login After Account Deletion

## Problem
After successfully deleting an account, the app navigates to `/` but the local session is still in memory. This leaves the user in a broken state where they can't interact with anything.

## Solution
Call `supabase.auth.signOut()` after successful account deletion to clear the local session. This will trigger the `onAuthStateChange` listener in `useAuthProfile`, which sets `session` to `null`, and the app routing in `App.tsx` will automatically redirect to the Auth screen.

## Change Required

**File:** `src/pages/Account.tsx`

Update the `handleDeleteAccount` function (lines 291-293):

```typescript
// Current code:
toast({ title: t("account.deleteSuccess") });
setDeleteDialogOpen(false);
navigate("/");

// Fixed code:
toast({ title: t("account.deleteSuccess") });
setDeleteDialogOpen(false);
// Clear local session to trigger redirect to login
await supabase.auth.signOut();
```

The `navigate("/")` is no longer needed because `signOut()` will:
1. Clear the local session from memory and localStorage
2. Trigger `onAuthStateChange` with `session = null`
3. Cause `App.tsx` to render the `<Auth />` component instead of protected routes

## Why This Works

The app's routing in `App.tsx` (lines 85-93) already handles unauthenticated users:

```typescript
if (!session) {
  <>
    <Route path="/:token" element={<SharedByToken />} />
    <Route path="*" element={<Auth />} />
  </>
}
```

So once `session` becomes `null`, any route (including `/`) will show the login screen.
