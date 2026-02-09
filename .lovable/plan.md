

# Admin Dashboard for Evoque

A simple, protected admin page accessible only to your master account (`diego@lumnia.dev`). It will show content moderation reports, app usage stats, and error logs.

---

## What You'll Get

### Tab 1: Overview Dashboard
- Total users count
- Total restaurant entries
- Total albums (public vs private)
- Total wines
- New users this week
- Active reports (pending)

### Tab 2: Content Reports
- List of all `content_reports` with status, reason, reporter, target, date
- Filter by status (pending / resolved / dismissed)
- Action buttons: "Resolve" and "Dismiss" (updates `status` column)
- Shows reporter and target user display names

### Tab 3: User Blocks
- List of all `user_blocks` with blocker and blocked display names
- Date of block

### Tab 4: Upload Error Logs
- List of recent `upload_error_logs` entries
- Shows error type, message, file info, platform, date

### Tab 5: Users
- List of all profiles with display name, email (from auth), created date
- Search by name

---

## Access Control

- Route: `/admin`
- The page checks the logged-in user's email against a hardcoded admin list: `["diego@lumnia.dev"]`
- If the user is not an admin, they see "Access denied" and a link back to home
- The route is NOT shown in the navigation bar (hidden page, accessed by URL only)
- Database queries use a new edge function `admin-dashboard` that verifies the user email server-side before returning data (since RLS on some tables like `content_reports` only allows users to see their own reports)

---

## Technical Details

### New Edge Function: `admin-dashboard`

Handles admin-only queries server-side using the service role key:
- Verifies the requesting user's email is in the admin list
- Accepts an `action` parameter: `overview`, `reports`, `update-report`, `blocks`, `errors`, `users`
- Returns the requested data
- Uses service role to bypass RLS (needed because admin needs to see ALL reports, blocks, errors, not just their own)

### New Page: `src/pages/Admin.tsx`

- Uses Tabs component (Overview, Reports, Blocks, Errors, Users)
- Calls the `admin-dashboard` edge function for all data
- Uses existing UI components (Card, Table, Badge, Tabs, Button)
- Responsive layout matching the rest of the app

### Files to Create/Modify

| File | Action |
|---|---|
| `src/pages/Admin.tsx` | NEW - admin dashboard page |
| `supabase/functions/admin-dashboard/index.ts` | NEW - server-side admin queries |
| `src/App.tsx` | Add `/admin` route (protected, lazy loaded) |

### Security Model

All data fetching goes through the edge function which:
1. Extracts the JWT from the Authorization header
2. Gets the user via `supabase.auth.getUser()`
3. Checks if user email === `diego@lumnia.dev`
4. Only then queries using the service role client
5. Returns 403 if not admin

This means even if someone discovers the `/admin` route, they cannot access any data without being logged in as the admin account.

