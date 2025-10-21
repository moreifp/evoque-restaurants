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
    const { action, data } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user's top-rated restaurants
    const { data: { user } } = await supabaseClient.auth.getUser();
    let userTopRated: any[] = [];
    
    if (user) {
      const { data: topRated } = await supabaseClient
        .from('restaurant_entries')
        .select('restaurant_name, location_address, rating, notes')
        .eq('user_id', user.id)
        .gte('rating', 4)
        .order('rating', { ascending: false })
        .limit(10);
      
      userTopRated = topRated || [];
    }

    let prompt = '';
    
    switch (action) {
      case 'start_planning':
        prompt = buildMainPrompt(data, userTopRated);
        break;
      case 'refine':
        prompt = buildRefinementPrompt(data, userTopRated);
        break;
      case 'schedule':
        prompt = buildSchedulingPrompt(data);
        break;
      case 'generate_summary':
        prompt = buildSummaryPrompt(data);
        break;
      default:
        throw new Error('Invalid action');
    }

    console.log('Calling AI with action:', action);

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
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    // Try to extract JSON from response
    let result;
    try {
      // Remove markdown code blocks if present
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                       content.match(/```\n?([\s\S]*?)\n?```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;
      result = JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse JSON response:', content);
      result = { raw_response: content };
    }

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in restaurant-planner:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildMainPrompt(data: any, userTopRated: any[]) {
  const { city, startDate, endDate, language = 'en-US' } = data;
  
  return `You are Évoque's trip dining concierge.

Respond in ${language === 'pt-BR' ? 'Portuguese (Brazil)' : 'English (US)'} language only.

Goal: ask a short, elegant set of questions to plan restaurants for a trip to ${city} and then propose options.

Inputs available:
- city: ${city}
- trip dates: ${startDate || 'not provided'} to ${endDate || 'not provided'}
- user's top-rated restaurants: ${JSON.stringify(userTopRated)}

Step 1 — Brief intake (no more than 6 questions total):
Ask concise questions about:
1) preferred cuisines or "surprise me"
2) vibe/occasion (romantic, trendy, classic, view, hidden gem)
3) price comfort (€, €€, €€€, €€€€)
4) lunch vs dinner ratio and any "must-try" dishes
5) constraints (kids-friendly, gluten-free, vegetarian, near specific neighborhood)
6) how many meals to plan

Keep it fast: multiple-choice style where possible.

Step 2 — Draft plan:
- Use your knowledge of ${city} restaurants to propose a shortlist (8–12) matching common preferences.
- Cross-reference user_top_rated to infer "taste profile" and use that as a prior when ranking.
- For each suggestion, provide: name, cuisine, vibe keywords, price level (€,€€,€€€,€€€€), one-line highlight (≤140 chars), why it fits the user's profile, and "Reservation likely needed: Yes/No".
- Group into 3 buckets: "Sure bets", "On-trend now", "Wildcards".

Step 3 — Scheduling canvas:
- Propose a 5–7 day matrix with lunch/dinner slots.
- Suggest the best slot for each pick (lunch/dinner) and spacing.
- Mark each slot with: { restaurant, meal: Lunch|Dinner, date, reservation_required: true/false }.

Output strictly as JSON following this schema:
{
  "intake_summary": { "cuisines": [], "vibe": [], "price": "€|€€|€€€|€€€€", "must_try": [], "constraints": [], "meals_to_plan": 0 },
  "recommendations": [
    { "bucket": "Sure bets|On-trend now|Wildcards",
      "name": "", "cuisine": "", "vibe": [], "price": "€",
      "highlight": "", "why_fit": "", "reservation_likely": true,
      "google_place_id": "", "area_hint": "" }
  ],
  "proposed_schedule": [
    { "day": "${startDate || 'D1'}", "meal": "Lunch|Dinner",
      "restaurant": "", "reservation_required": true, "notes": "" }
  ],
  "next_actions": ["Confirm slots", "Request reservations", "Swap options"]
}`;
}

function buildRefinementPrompt(data: any, userTopRated: any[]) {
  const { city, intakeJson, language = 'en-US' } = data;
  
  return `Refine the shortlist for ${city} using this intake: ${JSON.stringify(intakeJson)}
and the user's taste profile: ${JSON.stringify(userTopRated)}.

Respond in ${language === 'pt-BR' ? 'Portuguese (Brazil)' : 'English (US)'} language.

Return only JSON with the same schema, but limit recommendations to 8 and ensure at least:
- 3 "Sure bets"
- 3 "On-trend now"
- 2 "Wildcards"
Prioritize walkable clusters per day when possible. Keep highlights ≤140 chars.`;
}

function buildSchedulingPrompt(data: any) {
  const { chosenRecs, startDate, endDate, language = 'en-US' } = data;
  
  return `Given the chosen restaurants: ${JSON.stringify(chosenRecs)} 
and trip dates: ${startDate} to ${endDate},
build a balanced Lunch/Dinner schedule (no two heavy dinners back-to-back).

Respond in ${language === 'pt-BR' ? 'Portuguese (Brazil)' : 'English (US)'} language.

Add "reservation_required": true if the place is small, high-demand, or fine dining.
Return only JSON array:
[
  { "date": "YYYY-MM-DD", "meal": "Lunch|Dinner", "restaurant": "Name", "reservation_required": true, "google_place_id": "" }
]`;
}

function buildSummaryPrompt(data: any) {
  const { restaurantName, googlePlaceData, language = 'en-US' } = data;
  
  const instruction = language === 'pt-BR' 
    ? `Escreva uma breve descrição elegante (máx. 240 caracteres) sobre o restaurante ${restaurantName}, baseada nas informações do Google Places, tipo de cozinha e avaliações. Foque em ambiente, estilo e destaques da comida ou bebida. Não inclua endereço ou telefone. Exemplo: "Bistrô francês com pratos refinados e ambiente acolhedor — ideal para um jantar especial."`
    : `Write a short, elegant 240-character description of ${restaurantName} based on Google Places data, cuisine type, and reviews. Focus on ambiance, style, and food or drink highlights. Do not include address or contact info. Example: "French bistro with refined seafood dishes, cozy ambiance and attentive service — perfect for a special night out."`;
  
  return `${instruction}

${googlePlaceData ? `Restaurant data: ${JSON.stringify(googlePlaceData)}` : ''}

Return only the description text (no JSON, no quotes, just the text).`;
}
