import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
        JSON.stringify({ success: false, error: 'Authentication required' }),
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
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { imageUrl } = await req.json();
    
    // Validate imageUrl input
    if (!imageUrl || typeof imageUrl !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid imageUrl parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL format and scheme
    let url: URL;
    try {
      url = new URL(imageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Only HTTP/HTTPS URLs allowed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Restrict to Supabase storage for security
      if (!url.hostname.includes('supabase.co')) {
        return new Response(
          JSON.stringify({ success: false, error: 'URL must be from trusted storage' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Analyzing wine label from image:', imageUrl);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a professional sommelier and wine expert. Analyze wine bottle labels carefully and extract information. You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text). The JSON must have these fields: name (string, the wine name - NEVER use "Unknown"), producer (string), region (string), vintage (string or number), grape_variety (string), type (string: red/white/rose/sparkling), country (string), characteristics (string). If you cannot read the label clearly, make your best educated guess based on the visible details rather than saying "Unknown".'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this wine bottle label and extract all relevant information.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;

    console.log('AI raw response:', content);

    // Clean up the response - remove markdown code blocks if present
    if (content) {
      content = content.trim();
      // Remove ```json and ``` markers
      content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
    }

    console.log('AI cleaned response:', content);

    // Try to parse as JSON
    let wineInfo;
    try {
      wineInfo = JSON.parse(content);
      
      // Validate that we got useful data
      if (!wineInfo.name || wineInfo.name === 'Unknown' || wineInfo.name.toLowerCase() === 'unknown') {
        console.warn('AI returned Unknown wine name');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      // If not JSON, create a structured response
      wineInfo = {
        name: 'Wine Label',
        description: content,
        extracted: false,
        error: 'Could not parse wine information'
      };
    }

    return new Response(JSON.stringify({ success: true, wineInfo }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-wine-label function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
