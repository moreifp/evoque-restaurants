// Centralised public URL for shared restaurant links.
// Points to the share-og edge function so social bots get rich previews
// (Open Graph meta + branded image). Humans get a 302 to the SPA.

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const SHARE_OG_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/share-og`;

export function getShareUrl(entryId: string, token?: string | null): string {
  if (token) {
    return `${SHARE_OG_URL}?token=${encodeURIComponent(token)}`;
  }
  return `${SHARE_OG_URL}?entry_id=${encodeURIComponent(entryId)}`;
}
