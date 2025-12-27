import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
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

    const { imageUrl } = await req.json();
    
    // Validate imageUrl input
    if (!imageUrl || typeof imageUrl !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid imageUrl parameter' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format and scheme
    let url: URL;
    try {
      url = new URL(imageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return new Response(
          JSON.stringify({ error: 'Only HTTP/HTTPS URLs allowed' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Restrict to trusted storage domains for security
      const trustedDomains = ['supabase.co', 'supabase.in', 'lovableproject.com'];
      const isTrusted = trustedDomains.some(domain => url.hostname.includes(domain));
      if (!isTrusted) {
        console.error('Untrusted domain:', url.hostname);
        return new Response(
          JSON.stringify({ error: `URL must be from trusted storage. Got: ${url.hostname}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing receipt image:", imageUrl);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Use Google Gemini to analyze the receipt
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this restaurant receipt/bill and extract all the items. For each item, identify if it's a dish or drink, the name, quantity, unit price, and line total. Also extract subtotal, tax, service fee, and total. Return the data in structured format.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_receipt_data",
              description: "Extract structured data from a restaurant receipt",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item_type: {
                          type: "string",
                          enum: ["dish", "drink"],
                          description: "Type of item",
                        },
                        name: {
                          type: "string",
                          description: "Name of the dish or drink",
                        },
                        quantity: {
                          type: "number",
                          description: "Quantity ordered",
                        },
                        unit_price: {
                          type: "number",
                          description: "Price per unit",
                        },
                        line_total: {
                          type: "number",
                          description: "Total for this line item",
                        },
                      },
                      required: ["item_type", "name", "quantity", "unit_price", "line_total"],
                    },
                  },
                  subtotal: {
                    type: "number",
                    description: "Subtotal amount",
                  },
                  tax: {
                    type: "number",
                    description: "Tax amount",
                  },
                  service_fee: {
                    type: "number",
                    description: "Service fee or tip amount",
                  },
                  total: {
                    type: "number",
                    description: "Total amount",
                  },
                  currency: {
                    type: "string",
                    description: "Currency code (e.g., USD, EUR)",
                  },
                },
                required: ["items", "total", "currency"],
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "extract_receipt_data" },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Credits exhausted. Please add funds to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response received");

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const receiptData = JSON.parse(toolCall.function.arguments);
    console.log("Extracted receipt data:", receiptData);

    return new Response(JSON.stringify({ success: true, data: receiptData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing receipt:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
