

## Profile Privacy & Follow Request System

### Problem
Currently, following is instant and unconditional. Anyone can follow any user and immediately see their public albums without the target user's knowledge or consent.

### Database Changes

**1. Add privacy settings to `profiles` table:**
- `profile_visibility` enum: `public`, `approval_required`, `private`
  - `public`: anyone can follow instantly (current behavior)
  - `approval_required`: follow creates a pending request; target must approve
  - `private`: user is hidden from search results entirely

**2. Add `status` column to `user_follows` table:**
- `status` text: `accepted`, `pending`, `rejected` (default: `accepted`)
- When target profile is `public`, insert with `accepted`
- When target profile is `approval_required`, insert with `pending`

**3. Create `follow_notifications` table:**
- `id`, `user_id` (recipient), `actor_id` (who triggered), `type` (new_follower, follow_request, follow_accepted), `read`, `created_at`
- RLS: users can only view/update their own notifications

**4. Update RLS policies on `user_follows`:**
- SELECT: allow both follower and following to see (already exists)
- INSERT: check follower = auth.uid() (already exists)
- UPDATE: allow target user to update status (for approving/rejecting)

**5. Update RLS on albums/entries:**
- Add condition: only show content from followed users where `status = 'accepted'`

### Frontend Changes

**1. Account page - Privacy Settings card:**
- Radio group: Public / Approval Required / Private
- Saved to `profiles.profile_visibility`
- Description text explaining each mode

**2. Following page - Follow button logic:**
- Check target's `profile_visibility` before inserting
- If `approval_required`: insert with `pending` status, show "Requested" button state
- If `private`: hide follow button entirely (user shouldn't appear in search)
- If `public`: current instant-follow behavior

**3. Following page - New "Requests" tab:**
- Shows pending follow requests where current user is the target
- Accept/Reject buttons per request
- Badge count on tab for pending requests

**4. Notifications indicator:**
- Bell icon in Navigation showing unread notification count
- Dropdown or page listing: "X wants to follow you", "Y accepted your follow request", "Z started following you"

**5. UserPublicAlbums page:**
- If not following (or pending), hide albums and show "Follow to see albums" or "Request sent, waiting for approval"

### Implementation Steps

1. Run migration: add `profile_visibility` to profiles, add `status` to user_follows, create `follow_notifications` table with RLS
2. Update `handleFollow` in Following.tsx and Account.tsx to check target visibility and set appropriate status
3. Add privacy settings UI in Account.tsx with radio group
4. Add "Requests" tab in Following.tsx showing pending incoming requests with accept/reject
5. Add notification bell to Navigation.tsx with unread count badge
6. Update UserPublicAlbums.tsx to respect follow status
7. Add i18n translations for new strings (en + pt)

### Technical Details

- `profile_visibility` defaults to `public` to preserve current behavior for existing users
- A security definer function `get_profile_visibility(user_id)` avoids RLS recursion when checking visibility during follow
- Follow notifications are created via a database trigger on `user_follows` insert/update to keep logic server-side
- The `search_users_fuzzy` function will be updated to exclude users with `private` visibility
- Pending follows do NOT grant access to albums -- RLS checks `status = 'accepted'`

