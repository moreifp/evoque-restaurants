
# Apple App Store Compliance Review

## Analysis Summary

After reviewing the codebase, ChatGPT correctly identified the main compliance issue. Your app has **User Generated Content (UGC)** features that require additional safeguards under Apple's **Guideline 1.2 (User-Generated Content)**:

### Current UGC Features
- Public restaurant sharing via `/share/:id` and `/s/:token`
- Public albums viewable at `/albums/:id` when visibility="public"
- User public albums at `/user/:userId/albums`
- User search and follow system

### What's Missing

| Requirement | Status | Location Needed |
|-------------|--------|-----------------|
| Report Content | Missing | SharedRestaurant, AlbumDetail, UserPublicAlbums |
| Block User | Missing | Account page, UserPublicAlbums |
| Support Contact | Missing | Account Settings page |
| Content Moderation | Partial | Need database tables |

---

## Implementation Plan

### 1. Database Tables

**Table: `content_reports`**
```sql
- id (uuid, primary key)
- reporter_id (uuid, references auth.users)
- target_type (text: 'restaurant', 'album', 'user')
- target_id (uuid)
- target_user_id (uuid, the owner of reported content)
- reason (text: 'inappropriate', 'spam', 'offensive', 'other')
- details (text, optional description)
- status (text: 'pending', 'reviewed', 'dismissed')
- created_at (timestamp)
```

**Table: `user_blocks`**
```sql
- id (uuid, primary key)
- blocker_id (uuid, references auth.users)
- blocked_id (uuid, references auth.users)
- created_at (timestamp)
- unique constraint on (blocker_id, blocked_id)
```

### 2. UI Changes

**A) Support Contact in Account Settings**

Add a new "Support" card in `src/pages/Account.tsx` with:
- Email link: `contato@evoque.guru`
- External link to: `https://evoque.guru/support`

**B) Report Button on Public Content Pages**

Add "Report" option via dropdown menu (•••) on:
- `SharedRestaurant.tsx` - Report this restaurant
- `AlbumDetail.tsx` - Report this album (when viewing other's public album)
- `UserPublicAlbums.tsx` - Report this user

**C) Block User Feature**

Add "Block User" option on:
- `UserPublicAlbums.tsx` - Block button
- `Account.tsx` - New "Blocked Users" section to manage blocks

**D) Content Filtering (RLS)**

Update queries to filter out blocked users:
- Social search results
- Public albums from blocked users
- Shared content from blocked users

### 3. Files to Modify/Create

| File | Action |
|------|--------|
| Database migration | Create `content_reports` and `user_blocks` tables |
| `src/pages/Account.tsx` | Add Support section + Blocked Users management |
| `src/pages/SharedRestaurant.tsx` | Add Report dropdown menu |
| `src/pages/AlbumDetail.tsx` | Add Report dropdown for non-owner |
| `src/pages/UserPublicAlbums.tsx` | Add Report/Block dropdown |
| `src/components/ReportDialog.tsx` | New component for reporting |
| `src/hooks/useBlockedUsers.ts` | New hook to manage blocks |
| `src/i18n/translations/en.ts` | Add translations |
| `src/i18n/translations/pt.ts` | Add translations |

---

## UI Design

### Support Section (Account Page)
```text
┌────────────────────────────────────────────┐
│ 📧 Support                                 │
│ ──────────────────────────────────────────│
│                                            │
│ Need help? Contact us at:                  │
│ contato@evoque.guru           [Open Email] │
│                                            │
│ Visit our support page:                    │
│ evoque.guru/support           [Open Link]  │
└────────────────────────────────────────────┘
```

### Report Dialog
```text
┌────────────────────────────────────────────┐
│ Report Content                             │
│ ──────────────────────────────────────────│
│                                            │
│ Why are you reporting this?                │
│                                            │
│ ○ Inappropriate content                    │
│ ○ Spam or misleading                       │
│ ○ Offensive or harmful                     │
│ ○ Other                                    │
│                                            │
│ Additional details (optional):             │
│ [                              ]           │
│                                            │
│            [Cancel]  [Submit Report]       │
└────────────────────────────────────────────┘
```

### Blocked Users Section (Account Page)
```text
┌────────────────────────────────────────────┐
│ 🚫 Blocked Users                           │
│ ──────────────────────────────────────────│
│                                            │
│ [Avatar] User Name           [Unblock]     │
│ [Avatar] Another User        [Unblock]     │
│                                            │
│ No blocked users (when empty)              │
└────────────────────────────────────────────┘
```

---

## Regarding Push Notifications (OneSignal/Despia)

The Privacy Manifest (`PrivacyInfo.xcprivacy`) is NOT part of your Lovable project - it lives in the **native iOS project generated by Despia**. You need to:

1. **Check with Despia** if their wrapper includes the required Privacy Manifest
2. **Verify OneSignal SDK** version - recent versions include their own Privacy Manifest
3. **In App Store Connect**, declare the data types collected:
   - Device ID (for push notifications)
   - If NOT using tracking (IDFA), you may be able to remove `NSUserTrackingUsageDescription`

This is configuration on the Despia/native side, not something we can fix in Lovable code.

---

## Translation Keys to Add

```typescript
// English
support: {
  title: "Support",
  description: "Need help? Contact us",
  email: "Email Support",
  visitSupport: "Visit Support Page",
},
report: {
  title: "Report Content",
  reportUser: "Report User",
  reportRestaurant: "Report Restaurant", 
  reportAlbum: "Report Album",
  reason: "Why are you reporting this?",
  inappropriate: "Inappropriate content",
  spam: "Spam or misleading",
  offensive: "Offensive or harmful",
  other: "Other",
  details: "Additional details (optional)",
  detailsPlaceholder: "Tell us more...",
  submit: "Submit Report",
  success: "Report submitted",
  successDesc: "Thank you for helping keep our community safe",
  failed: "Failed to submit report",
},
block: {
  blockUser: "Block User",
  unblockUser: "Unblock",
  blockedUsers: "Blocked Users",
  noBlockedUsers: "No blocked users",
  blocked: "User blocked",
  blockedDesc: "You will no longer see content from this user",
  unblocked: "User unblocked",
  unblockedDesc: "You can now see content from this user",
}
```

---

## Summary

This implementation will satisfy Apple's UGC requirements:

- **Filter objectionable material**: Block feature hides content from blocked users
- **Mechanism to report**: Report dialog on all public content
- **Block abusive users**: Block/unblock user functionality
- **Published contact**: Support email visible in Account Settings

Shall I proceed with the implementation?
