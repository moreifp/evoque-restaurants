import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's JWT for verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user's token to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    console.log(`Starting account deletion for user: ${userId}`);

    // Create admin client for deletion operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Delete in order respecting foreign key constraints
    
    // 1. Delete push_tokens
    const { error: pushError } = await supabaseAdmin
      .from("push_tokens")
      .delete()
      .eq("user_id", userId);
    if (pushError) console.error("Error deleting push_tokens:", pushError);

    // 2. Delete user_follows (both directions)
    const { error: followsError1 } = await supabaseAdmin
      .from("user_follows")
      .delete()
      .eq("follower_id", userId);
    if (followsError1) console.error("Error deleting user_follows (follower):", followsError1);

    const { error: followsError2 } = await supabaseAdmin
      .from("user_follows")
      .delete()
      .eq("following_id", userId);
    if (followsError2) console.error("Error deleting user_follows (following):", followsError2);

    // Get user's restaurant entries for cascading deletes
    const { data: entries } = await supabaseAdmin
      .from("restaurant_entries")
      .select("id")
      .eq("user_id", userId);
    
    const entryIds = entries?.map((e) => e.id) || [];

    if (entryIds.length > 0) {
      // 3. Delete share_tokens
      const { error: shareError } = await supabaseAdmin
        .from("share_tokens")
        .delete()
        .in("entry_id", entryIds);
      if (shareError) console.error("Error deleting share_tokens:", shareError);

      // 4. Delete entry_tags
      const { error: tagsError } = await supabaseAdmin
        .from("entry_tags")
        .delete()
        .in("entry_id", entryIds);
      if (tagsError) console.error("Error deleting entry_tags:", tagsError);

      // Get receipts for cascading delete
      const { data: receipts } = await supabaseAdmin
        .from("receipts")
        .select("id")
        .in("entry_id", entryIds);
      
      const receiptIds = receipts?.map((r) => r.id) || [];

      // 5. Delete receipt_items
      if (receiptIds.length > 0) {
        const { error: itemsError } = await supabaseAdmin
          .from("receipt_items")
          .delete()
          .in("receipt_id", receiptIds);
        if (itemsError) console.error("Error deleting receipt_items:", itemsError);
      }

      // 6. Delete receipts
      const { error: receiptsError } = await supabaseAdmin
        .from("receipts")
        .delete()
        .in("entry_id", entryIds);
      if (receiptsError) console.error("Error deleting receipts:", receiptsError);

      // 7. Delete restaurant_photos
      const { error: photosError } = await supabaseAdmin
        .from("restaurant_photos")
        .delete()
        .in("entry_id", entryIds);
      if (photosError) console.error("Error deleting restaurant_photos:", photosError);

      // 8. Delete restaurant_social_links
      const { error: linksError } = await supabaseAdmin
        .from("restaurant_social_links")
        .delete()
        .in("entry_id", entryIds);
      if (linksError) console.error("Error deleting restaurant_social_links:", linksError);
    }

    // Get user's albums for cascading delete
    const { data: albums } = await supabaseAdmin
      .from("albums")
      .select("id")
      .eq("user_id", userId);
    
    const albumIds = albums?.map((a) => a.id) || [];

    // 9. Delete album_entries
    if (albumIds.length > 0) {
      const { error: albumEntriesError } = await supabaseAdmin
        .from("album_entries")
        .delete()
        .in("album_id", albumIds);
      if (albumEntriesError) console.error("Error deleting album_entries:", albumEntriesError);
    }

    // 10. Delete albums
    const { error: albumsError } = await supabaseAdmin
      .from("albums")
      .delete()
      .eq("user_id", userId);
    if (albumsError) console.error("Error deleting albums:", albumsError);

    // Get user's plans for cascading delete
    const { data: plans } = await supabaseAdmin
      .from("plans")
      .select("id")
      .eq("user_id", userId);
    
    const planIds = plans?.map((p) => p.id) || [];

    // 11. Delete plan_slots
    if (planIds.length > 0) {
      const { error: slotsError } = await supabaseAdmin
        .from("plan_slots")
        .delete()
        .in("plan_id", planIds);
      if (slotsError) console.error("Error deleting plan_slots:", slotsError);
    }

    // 12. Delete plans
    const { error: plansError } = await supabaseAdmin
      .from("plans")
      .delete()
      .eq("user_id", userId);
    if (plansError) console.error("Error deleting plans:", plansError);

    // 13. Delete scheduled_visits
    const { error: visitsError } = await supabaseAdmin
      .from("scheduled_visits")
      .delete()
      .eq("user_id", userId);
    if (visitsError) console.error("Error deleting scheduled_visits:", visitsError);

    // 14. Delete restaurant_entries
    const { error: entriesError } = await supabaseAdmin
      .from("restaurant_entries")
      .delete()
      .eq("user_id", userId);
    if (entriesError) console.error("Error deleting restaurant_entries:", entriesError);

    // 15. Delete upload_error_logs
    const { error: logsError } = await supabaseAdmin
      .from("upload_error_logs")
      .delete()
      .eq("user_id", userId);
    if (logsError) console.error("Error deleting upload_error_logs:", logsError);

    // 16. Delete profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);
    if (profileError) console.error("Error deleting profile:", profileError);

    // 17. Delete storage files (avatars and restaurant photos)
    try {
      // List and delete avatar files
      const { data: avatarFiles } = await supabaseAdmin.storage
        .from("restaurant-photos")
        .list(`avatars`, { search: userId });
      
      if (avatarFiles && avatarFiles.length > 0) {
        const avatarPaths = avatarFiles.map((f) => `avatars/${f.name}`);
        await supabaseAdmin.storage.from("restaurant-photos").remove(avatarPaths);
      }
    } catch (storageError) {
      console.error("Error cleaning up storage:", storageError);
    }

    // 18. Delete auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("Error deleting auth user:", authError);
      return new Response(
        JSON.stringify({ error: "Failed to delete auth user", details: authError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully deleted account for user: ${userId}`);

    return new Response(
      JSON.stringify({ success: true, message: "Account deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
