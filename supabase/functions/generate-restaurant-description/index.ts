import { aiFetch } from "../_shared/ai.ts";
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

    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { restaurantName, location, language } = await req.json();
    
    console.log('Generating description for:', restaurantName, 'Language:', language);


    const systemPrompt = language === 'pt' 
      ? "Você é um escritor especializado em descrições elegantes de restaurantes."
      : "You are a writer specialized in elegant restaurant descriptions.";

    const userPrompt = language === 'pt'
      ? `Escreva uma breve descrição elegante (máx. 240 caracteres) sobre o restaurante "${restaurantName}" localizado em "${location}". 
         Foque em ambiente, estilo e destaques da comida ou bebida. 
         Não inclua endereço ou telefone. 
         Exemplo: "Bistrô francês com pratos refinados e ambiente acolhedor — ideal para um jantar especial."
         
         IMPORTANTE: Retorne APENAS a descrição, sem aspas, sem prefixos, sem explicações.`
      : `Write a short, elegant description (max 240 characters) of the restaurant "${restaurantName}" located in "${location}".
         Focus on ambiance, style, and food or drink highlights.
         Do not include address or contact info.
         Example: "French bistro with refined seafood dishes, cozy ambiance and attentive service — perfect for a special night out."
         
         IMPORTANT: Return ONLY the description, no quotes, no prefixes, no explanations.`;

    const response = await aiFetch("anthropic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    }, { modelo: "rapido", maxTokens: 300 });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service out of credit. Please contact the administrator." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      throw new Error("AI error");
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim() || "";
    
    // Ensure description is within 240 characters
    const finalDescription = description.length > 240 
      ? description.substring(0, 237) + "..."
      : description;

    console.log('Generated description:', finalDescription);

    return new Response(
      JSON.stringify({ description: finalDescription }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating restaurant description:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
