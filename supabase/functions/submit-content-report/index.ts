import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { target_type, target_id, target_user_id, reason, details } = await req.json();

    if (!target_type || !target_id || !target_user_id || !reason) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Insert into content_reports
    const { error: insertError } = await supabase.from("content_reports").insert({
      reporter_id: user.id,
      target_type,
      target_id,
      target_user_id,
      reason,
      details: details?.trim() || null,
    });

    if (insertError) {
      console.error("Error inserting report:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create report" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Send email notification to developer
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      try {
        const emailBody = `
          <h2>New Content Report — Evoque</h2>
          <p><strong>Type:</strong> ${target_type}</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p><strong>Details:</strong> ${details || "None"}</p>
          <hr/>
          <p><strong>Reporter ID:</strong> ${user.id}</p>
          <p><strong>Reporter Email:</strong> ${user.email}</p>
          <p><strong>Target ID:</strong> ${target_id}</p>
          <p><strong>Target User ID:</strong> ${target_user_id}</p>
          <p><strong>Date:</strong> ${new Date().toISOString()}</p>
          <hr/>
          <p>Action required within 24 hours per Apple Guideline 1.2.</p>
        `;

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "Evoque Restaurants <nao-responda@mail.evoque.global>",
            to: ["fausto.moreira@gmail.com"],
            subject: `[Evoque] Content Report: ${reason} (${target_type})`,
            html: emailBody,
          }),
        });

        if (!emailResponse.ok) {
          const errText = await emailResponse.text();
          console.error("Resend email error:", errText);
        } else {
          console.log("Notification email sent successfully");
        }
      } catch (emailErr) {
        // Don't fail the report if email fails
        console.error("Email notification error:", emailErr);
      }
    } else {
      console.warn("RESEND_API_KEY not configured, skipping email notification");
    }

    return new Response(
      JSON.stringify({ success: true }),
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
