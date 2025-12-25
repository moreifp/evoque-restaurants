import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { restaurantName, location, rating, companions, visitDate } = await req.json();
    
    console.log('Generating note for:', restaurantName);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = "You are a helpful assistant that creates personalized restaurant notes based on dining experiences. Write in a natural, conversational tone as if the diner is reflecting on their experience.";

    // Build context based on available information
    let contextDetails = [];
    if (rating && rating > 0) {
      contextDetails.push(`rated it ${rating} out of 5 stars`);
    }
    if (companions) {
      contextDetails.push(`went with ${companions}`);
    }
    if (visitDate) {
      contextDetails.push(`visited on ${new Date(visitDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`);
    }
    
    const context = contextDetails.length > 0 
      ? `. The diner ${contextDetails.join(", ")}`
      : "";

    const userPrompt = `Write a brief, personal note (2-3 sentences, max 200 characters) about a dining experience at "${restaurantName}"${location ? ` in ${location}` : ""}${context}.

The note should:
- Sound like a personal reflection
- Mention the ambiance or atmosphere
- Include a highlight about the food or service
- Be warm and authentic

Example: "Had a wonderful dinner here with family. The cozy atmosphere and attentive service made it special. The seafood pasta was absolutely delicious!"

IMPORTANT: Return ONLY the note text, no quotes, no labels, no explanations.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const note = data.choices?.[0]?.message?.content?.trim() || "";
    
    // Ensure note is within reasonable length
    const finalNote = note.length > 300 
      ? note.substring(0, 297) + "..."
      : note;

    console.log('Generated note:', finalNote);

    return new Response(
      JSON.stringify({ note: finalNote }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating restaurant note:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
