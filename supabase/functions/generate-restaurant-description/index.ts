import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { restaurantName, location, language } = await req.json();
    
    console.log('Generating description for:', restaurantName, 'Language:', language);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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
