
# Plan: Add Account Deletion Feature

## Problem
Apple rejected your app because it lacks an **account deletion** feature, which is required under Guideline 5.1.1(v) - Data Collection and Storage.

## Solution Overview
Add a complete account deletion flow with:
1. A "Danger Zone" section in Account Settings
2. Confirmation dialog to prevent accidental deletion
3. Backend edge function to securely delete all user data and auth account

---

## Changes Required

### 1. Create Edge Function: `delete-account`

**File:** `supabase/functions/delete-account/index.ts`

This edge function will:
- Authenticate the user via JWT token
- Delete all user data from related tables in order:
  - `push_tokens`
  - `user_follows` (both follower and following)
  - `share_tokens` (via restaurant_entries)
  - `entry_tags` (via restaurant_entries)
  - `receipt_items` (via receipts)
  - `receipts` (via restaurant_entries)
  - `restaurant_photos` (via restaurant_entries)
  - `restaurant_social_links` (via restaurant_entries)
  - `album_entries`
  - `albums`
  - `plan_slots` (via plans)
  - `plans`
  - `scheduled_visits`
  - `restaurant_entries`
  - `profiles`
  - `upload_error_logs`
- Delete the auth user using Supabase Admin API
- Return success or error

### 2. Update Account Page

**File:** `src/pages/Account.tsx`

Add a new "Danger Zone" section with:
- Warning card with red styling
- "Delete Account" button
- AlertDialog confirmation with:
  - Clear warning about permanent deletion
  - Checkbox to confirm understanding
  - Cancel and Delete buttons
- Loading state during deletion
- Success handling (redirect to login)

### 3. Add Translations

**Files:** 
- `src/i18n/translations/en.ts`
- `src/i18n/translations/pt.ts`

New translation keys:
```text
account.dangerZone: "Danger Zone"
account.deleteAccount: "Delete Account"
account.deleteAccountDesc: "Permanently delete your account and all associated data"
account.deleteAccountTitle: "Delete Account?"
account.deleteAccountWarning: "This action cannot be undone. All your data will be permanently deleted, including:"
account.deleteAccountList: "• All restaurant entries and photos\n• All albums and collections\n• All scheduled visits and plans\n• Your profile and preferences"
account.deleteAccountConfirm: "I understand this action is permanent"
account.deleting: "Deleting..."
account.deleteSuccess: "Account deleted successfully"
account.deleteFailed: "Failed to delete account"
```

---

## UI Design

The "Danger Zone" section will appear at the bottom of the Account page, before the Sign Out button:

```text
┌────────────────────────────────────────────┐
│ ⚠️ Danger Zone                             │
│ ──────────────────────────────────────────│
│                                            │
│ Delete Account                             │
│ Permanently delete your account and all    │
│ associated data. This cannot be undone.    │
│                                            │
│                    [Delete Account] (red)  │
└────────────────────────────────────────────┘
```

Confirmation Dialog:
```text
┌────────────────────────────────────────────┐
│ Delete Account?                            │
│ ──────────────────────────────────────────│
│                                            │
│ This action cannot be undone. All your     │
│ data will be permanently deleted:          │
│                                            │
│ • All restaurant entries and photos        │
│ • All albums and collections               │
│ • All scheduled visits and plans           │
│ • Your profile and preferences             │
│                                            │
│ ☐ I understand this action is permanent    │
│                                            │
│            [Cancel]  [Delete Account]      │
└────────────────────────────────────────────┘
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/delete-account/index.ts` | Create |
| `src/pages/Account.tsx` | Modify - add Danger Zone section |
| `src/i18n/translations/en.ts` | Modify - add translations |
| `src/i18n/translations/pt.ts` | Modify - add translations |

---

## Technical Details

### Edge Function Security

The edge function uses:
- JWT authentication to verify user identity
- Supabase Service Role key for admin operations
- Transaction-like deletion order (respects foreign key constraints)

### Deletion Order

Tables must be deleted in this order to respect foreign key relationships:

1. `push_tokens` (user_id)
2. `user_follows` (follower_id, following_id)
3. `share_tokens` (via entry_id → restaurant_entries)
4. `entry_tags` (via entry_id)
5. `receipt_items` (via receipt_id → receipts)
6. `receipts` (via entry_id)
7. `restaurant_photos` (via entry_id)
8. `restaurant_social_links` (via entry_id)
9. `album_entries` (via album_id)
10. `albums` (user_id)
11. `plan_slots` (via plan_id)
12. `plans` (user_id)
13. `scheduled_visits` (user_id)
14. `restaurant_entries` (user_id)
15. `upload_error_logs` (user_id)
16. `profiles` (id = user_id)
17. Auth user (via admin API)

### Storage Cleanup

The edge function will also delete user files from storage:
- Avatar images in `restaurant-photos/avatars/`
- Restaurant photos uploaded by the user

---

## Apple Compliance

This implementation satisfies Apple's requirements:
- ✅ Full account deletion (not just deactivation)
- ✅ All user data is permanently removed
- ✅ Confirmation step prevents accidental deletion
- ✅ No external website required
- ✅ No customer service contact required
