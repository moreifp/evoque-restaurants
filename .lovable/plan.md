

# Plan: Fix Apple Guideline 1.2 Rejection - UGC Safety

Apple rejected the app because several UGC safety requirements are not fully met. Here is exactly what is missing and how to fix each point.

---

## What Apple Requires vs What We Have

| Apple Requirement | Current Status | Fix Needed |
|---|---|---|
| Users must agree to EULA with zero-tolerance language | Passive "By signing up, you agree..." text, no checkbox | Add required checkbox on sign-up |
| Method for filtering objectionable content | Block exists but content is NOT filtered anywhere | Filter blocked users from search, following, and public views |
| Mechanism to flag content | Report dialog exists on some pages | Already done (verify visibility) |
| Block abusive users + notify developer | Block works but does NOT notify developer | Auto-create a content_report when blocking |
| Block removes content from feed instantly | Block doesn't remove user from current view | Instantly remove blocked user from visible lists |
| Developer acts within 24 hours | Operational process, no tooling | Already operational (support email exists) |

---

## Changes Required

### 1. EULA Checkbox on Sign-Up

**File:** `src/components/Auth.tsx`

Add a required checkbox before the submit button during sign-up:

- Checkbox text: "I agree to the Terms of Use and acknowledge zero tolerance for objectionable content or abusive behavior"
- Sign-up button disabled until checkbox is checked
- Links to Terms of Use and Privacy Policy within the label

### 2. Block + Report on Following/Social Page

**File:** `src/pages/Following.tsx`

The Following page currently only shows "Unfollow". Add a dropdown menu (three dots) per user with:

- "Report User"
- "Block User"

After blocking, the user is instantly removed from the following list and search results.

### 3. Filter Blocked Users from All Content

**File:** `src/pages/Following.tsx`

- Filter blocked user IDs from search results
- Filter blocked user IDs from the following list
- Use the `useBlockedUsers` hook to get `blockedIds`

**File:** `src/pages/Account.tsx` (Social section)

- Same filtering for the search results and following list in Account settings

### 4. Block Automatically Notifies Developer

**File:** `src/hooks/useBlockedUsers.ts`

When `blockUser()` is called, also insert a record into `content_reports` table with:

- `target_type: "user"`
- `target_id: userId`
- `target_user_id: userId`
- `reason: "blocked"`
- `details: "User was blocked by another user"`

This ensures every block creates an audit trail for the developer to review.

### 5. Instant Content Removal After Block

**File:** `src/pages/Following.tsx`

After blocking a user:

- Remove them from the displayed search results immediately
- Remove them from the following list immediately (also unfollow)

**File:** `src/pages/UserPublicAlbums.tsx`

After blocking a user:

- Navigate back (the user should not see the blocked user's content)

### 6. Add Translations

**Files:** `src/i18n/translations/en.ts` and `src/i18n/translations/pt.ts`

New keys:

- `auth.agreeToTerms`: "I agree to the Terms of Use and acknowledge zero tolerance for objectionable content or abusive behavior"
- `auth.mustAgreeToTerms`: "You must agree to the terms to create an account"

---

## Files to Create/Modify

| File | Action |
|---|---|
| `src/components/Auth.tsx` | Add EULA checkbox on sign-up |
| `src/pages/Following.tsx` | Add block/report dropdown, filter blocked users |
| `src/hooks/useBlockedUsers.ts` | Auto-create content_report on block |
| `src/pages/UserPublicAlbums.tsx` | Navigate away after blocking |
| `src/i18n/translations/en.ts` | Add new translation keys |
| `src/i18n/translations/pt.ts` | Add new translation keys |

---

## Technical Details

### EULA Checkbox Implementation

The checkbox will use a `useState<boolean>` that must be `true` before the sign-up form can submit. The existing "By signing up, you agree to our Terms" text will be replaced by the interactive checkbox.

### Block Notification Flow

```text
User clicks "Block"
  |
  +--> Insert into user_blocks table (existing)
  |
  +--> Insert into content_reports table (NEW)
  |      reporter_id: current user
  |      target_type: "user"
  |      target_id: blocked user
  |      reason: "blocked"
  |
  +--> Remove user from current view (NEW)
  +--> Unfollow if following (NEW)
```

### Content Filtering

The `useBlockedUsers` hook returns `blockedIds` (a Set). Each page that shows other users will filter out any user whose ID is in this set before rendering.

