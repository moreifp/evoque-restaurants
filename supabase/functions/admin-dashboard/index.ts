import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["diego@lumnia.dev"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user identity with anon client
    const anonClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser(token);

    if (userError || !user || !ADMIN_EMAILS.includes(user.email ?? "")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for all queries (bypasses RLS)
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, ...params } = await req.json();

    let data: unknown = null;

    switch (action) {
      case "overview": {
        const [users, entries, albums, reports, newUsersWeek] =
          await Promise.all([
            admin
              .from("profiles")
              .select("id", { count: "exact", head: true }),
            admin
              .from("restaurant_entries")
              .select("id", { count: "exact", head: true }),
            admin.from("albums").select("id, visibility"),
            admin
              .from("content_reports")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending"),
            admin
              .from("profiles")
              .select("id", { count: "exact", head: true })
              .gte(
                "created_at",
                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
              ),
          ]);

        const albumData = albums.data ?? [];
        const publicAlbums = albumData.filter(
          (a) => a.visibility === "public"
        ).length;
        const privateAlbums = albumData.filter(
          (a) => a.visibility !== "public"
        ).length;

        data = {
          totalUsers: users.count ?? 0,
          totalEntries: entries.count ?? 0,
          totalAlbums: albumData.length,
          publicAlbums,
          privateAlbums,
          pendingReports: reports.count ?? 0,
          newUsersThisWeek: newUsersWeek.count ?? 0,
        };
        break;
      }

      case "reports": {
        const statusFilter = params.status;
        let query = admin
          .from("content_reports")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        if (statusFilter && statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }

        const { data: reports } = await query;

        // Get profile names for reporter and target
        const userIds = new Set<string>();
        (reports ?? []).forEach((r) => {
          userIds.add(r.reporter_id);
          userIds.add(r.target_user_id);
        });

        const { data: profiles } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", Array.from(userIds));

        const profileMap = new Map(
          (profiles ?? []).map((p) => [p.id, p.display_name])
        );

        data = (reports ?? []).map((r) => ({
          ...r,
          reporter_name: profileMap.get(r.reporter_id) ?? "Unknown",
          target_user_name: profileMap.get(r.target_user_id) ?? "Unknown",
        }));
        break;
      }

      case "update-report": {
        const { reportId, status } = params;
        const { error } = await admin
          .from("content_reports")
          .update({ status })
          .eq("id", reportId);

        if (error) throw error;
        data = { success: true };
        break;
      }

      case "blocks": {
        const { data: blocks } = await admin
          .from("user_blocks")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        const userIds = new Set<string>();
        (blocks ?? []).forEach((b) => {
          userIds.add(b.blocker_id);
          userIds.add(b.blocked_id);
        });

        const { data: profiles } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", Array.from(userIds));

        const profileMap = new Map(
          (profiles ?? []).map((p) => [p.id, p.display_name])
        );

        data = (blocks ?? []).map((b) => ({
          ...b,
          blocker_name: profileMap.get(b.blocker_id) ?? "Unknown",
          blocked_name: profileMap.get(b.blocked_id) ?? "Unknown",
        }));
        break;
      }

      case "errors": {
        const { data: errors } = await admin
          .from("upload_error_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        data = errors ?? [];
        break;
      }

      case "users": {
        const search = params.search ?? "";
        let query = admin
          .from("profiles")
          .select("id, display_name, avatar_url, created_at")
          .order("created_at", { ascending: false })
          .limit(200);

        if (search) {
          query = query.ilike("display_name", `%${search}%`);
        }

        const { data: profiles } = await query;

        // Get emails from auth
        const { data: authData } = await admin.auth.admin.listUsers({
          perPage: 1000,
        });

        const emailMap = new Map(
          (authData?.users ?? []).map((u) => [u.id, u.email])
        );

        data = (profiles ?? []).map((p) => ({
          ...p,
          email: emailMap.get(p.id) ?? "—",
        }));
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
