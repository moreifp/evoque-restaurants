import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { visitId } = await req.json();

    if (!visitId) {
      return new Response(
        JSON.stringify({ error: "visitId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: visit, error } = await supabaseClient
      .from("scheduled_visits")
      .select("*")
      .eq("id", visitId)
      .single();

    if (error || !visit) {
      console.error("Error fetching visit:", error);
      return new Response(
        JSON.stringify({ error: "Visit not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format dates for ICS (YYYYMMDDTHHMMSSZ)
    const formatICSDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const dtStart = formatICSDate(visit.start_datetime);
    const dtEnd = formatICSDate(visit.end_datetime);
    const dtStamp = formatICSDate(new Date().toISOString());

    // Build description
    const descParts = [];
    if (visit.restaurant_name) descParts.push(`Restaurant: ${visit.restaurant_name}`);
    if (visit.location_address) descParts.push(`Address: ${visit.location_address}`);
    if (visit.phone) descParts.push(`Phone: ${visit.phone}`);
    if (visit.website) descParts.push(`Website: ${visit.website}`);
    if (visit.booking_ref) descParts.push(`Booking Ref: ${visit.booking_ref}`);
    if (visit.notes) descParts.push(`Notes: ${visit.notes}`);
    if (visit.maps_url) descParts.push(`Maps: ${visit.maps_url}`);

    const description = descParts.join("\\n");
    const location = visit.location_address || visit.city || "";
    const mealLabel = visit.meal_type.charAt(0).toUpperCase() + visit.meal_type.slice(1);
    const summary = `${mealLabel} at ${visit.restaurant_name}`;

    // Generate ICS content
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Evoque//Restaurant Agenda//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${visit.id}@evoque.guru
DTSTAMP:${dtStamp}
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${summary}
DESCRIPTION:${description}
LOCATION:${location}
BEGIN:VALARM
TRIGGER:-P1D
ACTION:DISPLAY
DESCRIPTION:Reminder: ${summary} tomorrow
END:VALARM
BEGIN:VALARM
TRIGGER:-PT2H
ACTION:DISPLAY
DESCRIPTION:Reminder: ${summary} in 2 hours
END:VALARM
END:VEVENT
END:VCALENDAR`;

    console.log("Generated ICS for visit:", visitId);

    return new Response(
      JSON.stringify({ icsContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating ICS:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});