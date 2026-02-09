

# Plan: Complete Apple Guideline 1.2 Compliance

Analysis of the Claude Code suggestions against the current codebase. Three real gaps need fixing.

---

## Gap 1: EULA NOT enforced on OAuth sign-ups

**Problem:** The Apple and Google sign-in buttons (lines 326-348 of Auth.tsx) are NOT disabled when `agreedToTerms` is false during sign-up mode. A user can tap "Sign up with Apple" or "Sign up with Google" without ever agreeing to the EULA.

**Fix:** In `src/components/Auth.tsx`:
- When `isSignUp` is true, disable Apple/Google buttons unless `agreedToTerms` is checked
- Move the EULA checkbox ABOVE the OAuth buttons so users see it first
- Show the checkbox in sign-up mode before everything else

---

## Gap 2: Blocked users NOT filtered globally

**Problem:** Only `Following.tsx` filters `blockedIds`. Other pages that show third-party content do NOT filter blocked users:
- `UserPublicAlbums.tsx` — still shows albums from a blocked user (only navigates away on manual block action, but if you navigate directly to `/user/{blockedId}/albums`, content loads)
- `AlbumDetail.tsx` — shows public albums from any user including blocked ones
- `SharedRestaurant.tsx` — shows shared restaurants from blocked users
- `AlbumsMap.tsx` — no block filtering

**Fix (two layers):**

### Layer A: Frontend — BlockedUsersProvider (context)
Create `src/contexts/BlockedUsersContext.tsx`:
- Wraps the app in `App.tsx` inside the authenticated routes
- Loads `blockedIds` once on mount
- Exposes `blockedIds`, `isBlocked()`, `blockUser()`, `unblockUser()` globally
- Pages consume via `useBlockedUsersContext()` instead of instantiating `useBlockedUsers()` separately

Apply filtering in:
- `UserPublicAlbums.tsx`: if `isBlocked(userId)`, show "User not found" instead of their albums
- `AlbumDetail.tsx`: if album owner is blocked, show "Album not available"
- `SharedRestaurant.tsx`: if entry owner is blocked, show "Not available" (only for logged-in users)

### Layer B: Database RLS (defense in depth)
The `is_blocked_by(blocker, blocked)` function already exists. Add RLS policies on public content tables to block SELECT when a block exists in either direction:

- **albums** (public visibility): add policy denying SELECT when `is_blocked_by(auth.uid(), user_id)` or `is_blocked_by(user_id, auth.uid())`
- **restaurant_entries** (is_public = true): same pattern
- **restaurant_photos** (public entries): inherited via existing join policies

This ensures even if frontend misses a filter, the database won't return data from blocked users.

---

## Gap 3: No developer notification mechanism

**Problem:** When a user reports or blocks someone, a row goes into `content_reports`, but no one is notified. Apple expects the developer to be able to "act within 24 hours." There is no email notification and no admin panel.

**Fix (minimum viable):**

### A. Edge function `submit-content-report`
Create a new edge function that:
1. Receives the report data (target_type, target_id, reason, details)
2. Inserts into `content_reports`
3. Sends an email notification to `contato@evoque.guru` using Resend (or a simple fetch to an email API)

Update `ReportDialog.tsx` and `useBlockedUsers.ts` to call this edge function instead of inserting directly into `content_reports`.

### B. Simple admin moderation (optional but recommended)
This is NOT strictly required for Apple approval if you can demonstrate you monitor reports via email. But for robustness, a simple admin page listing pending reports would help.

---

## What does NOT need changing (from Claude Code suggestions)

| Suggestion | Verdict |
|---|---|
| "Profanity filtering on text content" | Not required by Apple 1.2. The guideline says "method for filtering objectionable content" which is satisfied by report + block + moderation. Profanity filters are a nice-to-have. |
| "Admin panel with ban/remove" | Nice-to-have but not a blocker. Email notification + manual DB action satisfies the "24 hour" rule. |
| "is_banned column on profiles" | Over-engineering for now. Can be added later if needed. |
| "Apple token revocation" | Already identified in previous plan — will implement in `delete-account` edge function. |

---

## Files to Create/Modify

| File | Change |
|---|---|
| `src/components/Auth.tsx` | Move EULA checkbox above OAuth buttons; disable OAuth buttons when unchecked in sign-up mode |
| `src/contexts/BlockedUsersContext.tsx` | NEW — global provider for blocked users |
| `src/App.tsx` | Wrap authenticated routes with BlockedUsersProvider |
| `src/pages/UserPublicAlbums.tsx` | Use context; block access if user is blocked |
| `src/pages/AlbumDetail.tsx` | Use context; block access if album owner is blocked |
| `src/pages/SharedRestaurant.tsx` | Use context; block access if entry owner is blocked (logged-in only) |
| `src/pages/Following.tsx` | Switch to context instead of local useBlockedUsers |
| `src/hooks/useBlockedUsers.ts` | Keep as-is (used by context internally) |
| `supabase/functions/submit-content-report/index.ts` | NEW — insert report + send email notification |
| `src/components/ReportDialog.tsx` | Call edge function instead of direct insert |
| Database migration | Add RLS policies on albums and restaurant_entries to deny SELECT for blocked users |

---

## Technical Details

### BlockedUsersProvider

```text
BlockedUsersContext
  |
  +-- loads blockedIds on auth state change
  +-- exposes: blockedIds, isBlocked(), blockUser(), unblockUser()
  +-- blockUser() also calls submit-content-report edge function
  +-- refetches after block/unblock
```

### RLS Policy for Block Filtering

```text
Policy on "albums" table (SELECT, restrictive):
  USING NOT (
    is_blocked_by(auth.uid(), user_id) 
    OR is_blocked_by(user_id, auth.uid())
  )
  -- Only applies when auth.uid() IS NOT NULL (logged-in users)

Same pattern on "restaurant_entries" for public entries.
```

### Email Notification Flow

```text
User clicks "Report" or "Block"
  |
  +-> POST /submit-content-report
  |     body: { target_type, target_id, target_user_id, reason, details }
  |
  +-> Edge function:
        1. Insert into content_reports
        2. Send email to contato@evoque.guru via Resend API
        3. Return success
```

