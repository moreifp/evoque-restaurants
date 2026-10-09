import { aiFetch } from "../_shared/ai.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      console.error("Auth error:", authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageUrl, targetLanguage = "Portuguese", photoId } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Image URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Translating menu for user ${user.id}, photo ${photoId}, target: ${targetLanguage}`);

    const systemPrompt = `You are an expert culinary translator and food cultural advisor. Your task is to analyze restaurant menu photos and provide comprehensive translations with cultural context.

When translating menus:
1. Identify all menu items visible in the image
2. Translate each item to ${targetLanguage}
3. For traditional, ethnic, or unfamiliar dishes, add brief explanations in parentheses describing:
   - Key ingredients
   - Cooking method or preparation style
   - Cultural significance or origin
4. Preserve original prices when visible
5. Organize items by category using relevant emoji headers

Format your response like this:
🍽️ SECTION NAME (Original Section if applicable)
• Item Name in ${targetLanguage} | Price
  (Brief explanation of traditional/unfamiliar dishes)

Categories to use when appropriate:
🐟 FISH / SEAFOOD
🍗 POULTRY
🥩 MEATS
🥗 VEGETARIAN / SALADS
🍝 PASTA / RICE
🍲 SOUPS / STEWS
🧀 APPETIZERS / STARTERS
🍰 DESSERTS
🍷 BEVERAGES / DRINKS

Be thorough but concise. Focus on helping someone who cannot read the original language understand what each dish actually is and how it's prepared.`;

    const userPrompt = `Please analyze this restaurant menu photo and translate ALL items to ${targetLanguage}. 

For each dish:
1. Provide the translated name
2. Include the original price if visible
3. Add a brief explanation (in parentheses) of traditional ingredients or preparation methods, especially for ethnic or unfamiliar cuisine items

Format the output with emoji category headers for easy reading.`;

    console.log("Calling Lovable AI with Gemini 2.5 Flash for menu translation...");

    const response = await aiFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit reached. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const translation = aiResponse.choices?.[0]?.message?.content;

    if (!translation) {
      console.error("No translation content in AI response");
      throw new Error("Failed to get translation from AI");
    }

    console.log("Translation received, length:", translation.length);

    // Save translation to database if photoId provided
    if (photoId) {
      const { error: updateError } = await supabase
        .from("restaurant_photos")
        .update({ menu_translation: translation })
        .eq("id", photoId);

      if (updateError) {
        console.error("Error saving translation:", updateError);
        // Don't fail the request, just log the error
      } else {
        console.log("Translation saved to database for photo:", photoId);
      }
    }

    return new Response(
      JSON.stringify({ success: true, translation }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in translate-menu function:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to translate menu";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
