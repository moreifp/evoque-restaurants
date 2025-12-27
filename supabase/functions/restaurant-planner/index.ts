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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user's top-rated restaurants
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    if (userError) {
      console.warn('Auth error in restaurant-planner:', userError.message);
    }
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

    // Build request body with structured output for start_planning
    const requestBody: any = {
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    // Use tool calling to enforce JSON structure for start_planning and refine
    if (action === 'start_planning' || action === 'refine') {
      requestBody.tools = [
        {
          type: "function",
          function: {
            name: action === 'start_planning' ? "create_restaurant_plan" : "refine_recommendations",
            description: action === 'start_planning' 
              ? "Create a restaurant dining plan with recommendations and schedule"
              : "Refine restaurant recommendations based on updated preferences",
            parameters: {
              type: "object",
              properties: action === 'refine' ? {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      bucket: { type: "string" },
                      name: { type: "string" },
                      cuisine: { type: "string" },
                      vibe: { type: "array", items: { type: "string" } },
                      price: { type: "string" },
                      highlight: { type: "string" },
                      why_fit: { type: "string" },
                      reservation_likely: { type: "boolean" },
                      google_place_id: { type: "string" },
                      area_hint: { type: "string" }
                    }
                  }
                }
              } : {
                intake_summary: {
                  type: "object",
                  properties: {
                    cuisines: { type: "array", items: { type: "string" } },
                    vibe: { type: "array", items: { type: "string" } },
                    price: { type: "string" },
                    must_try: { type: "array", items: { type: "string" } },
                    constraints: { type: "array", items: { type: "string" } },
                    meals_to_plan: { type: "number" }
                  }
                },
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      bucket: { type: "string" },
                      name: { type: "string" },
                      cuisine: { type: "string" },
                      vibe: { type: "array", items: { type: "string" } },
                      price: { type: "string" },
                      highlight: { type: "string" },
                      why_fit: { type: "string" },
                      reservation_likely: { type: "boolean" },
                      google_place_id: { type: "string" },
                      area_hint: { type: "string" }
                    }
                  }
                },
                proposed_schedule: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      day: { type: "string" },
                      meal: { type: "string" },
                      restaurant: { type: "string" },
                      reservation_required: { type: "boolean" },
                      notes: { type: "string" }
                    }
                  }
                },
                next_actions: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: action === 'refine' ? ["recommendations"] : ["intake_summary", "recommendations", "proposed_schedule", "next_actions"]
            }
          }
        }
      ];
      requestBody.tool_choice = { 
        type: "function", 
        function: { name: action === 'start_planning' ? "create_restaurant_plan" : "refine_recommendations" } 
      };
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
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
    
    // Handle tool calling response for start_planning and refine
    let result;
    if ((action === 'start_planning' || action === 'refine') && aiData.choices?.[0]?.message?.tool_calls?.[0]) {
      const toolCall = aiData.choices[0].message.tool_calls[0];
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error('Failed to parse tool call arguments:', toolCall.function.arguments);
        throw new Error('Failed to parse AI response');
      }
    } else {
      // Handle regular text response for other actions
      const content = aiData.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('No response from AI');
      }

      // Try to extract JSON from response
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
  const { city, startDate, endDate, language = 'en-US', instructions } = data;
  
  // Calculate number of days and generate explicit date list
  let dateList: string[] = [];
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateList.push(d.toISOString().split('T')[0]);
    }
  }
  
  const datesInfo = dateList.length > 0 
    ? `Dates to plan (use EXACTLY these dates in YYYY-MM-DD format): ${dateList.join(', ')}`
    : `Plan for 5-7 generic days using D1, D2, D3, etc.`;

  // Build user instructions section if provided
  const userInstructionsSection = instructions && instructions.trim()
    ? `

═══════════════════════════════════════════════════════════════
🚨 CRITICAL: USER'S SPECIFIC RESTAURANT INSTRUCTIONS 🚨
═══════════════════════════════════════════════════════════════

The user has provided SPECIFIC restaurant recommendations and instructions below.
You MUST prioritize these restaurants in your plan. Extract restaurant names,
dates, and meal types from these instructions and use them EXACTLY as specified.

USER INSTRUCTIONS:
${instructions}

═══════════════════════════════════════════════════════════════

MANDATORY RULES FOR USER INSTRUCTIONS:
1. If the user mentions a restaurant for a specific date/meal, USE THAT RESTAURANT
2. Extract ALL restaurant names mentioned and include them in recommendations
3. Respect the user's categorization (lunch options, dinner options, etc.)
4. Only add your own suggestions for slots NOT covered by user instructions
5. If user mentions "Reserva Confirmada" for a restaurant, mark reservation_required: false (already done)
6. Preserve user's notes about restaurants (why to go, what to order, etc.)
`
    : '';
  
  return `You are Évoque's trip dining concierge. Create a restaurant dining plan for ${city}.

Respond in ${language === 'pt-BR' ? 'Portuguese (Brazil)' : 'English (US)'} language only.

IMPORTANT: You must return structured data using the create_restaurant_plan function. Do not ask questions or return text - provide a complete plan immediately.
${userInstructionsSection}
Context:
- City: ${city}
- ${datesInfo}
- User's taste profile from top-rated restaurants: ${JSON.stringify(userTopRated)}

CRITICAL RULES FOR PROPOSED SCHEDULE:
1. The "day" field MUST be in YYYY-MM-DD format (e.g., "2025-12-27") if dates are provided
2. Each date MUST have BOTH Almoço (lunch) AND Jantar (dinner) slots
3. You MUST include ALL dates provided - do not skip any date
4. For each date: first Almoço, then Jantar
5. "meal" field should be "Almoço" or "Jantar" in Portuguese, "Lunch" or "Dinner" in English
6. IF USER INSTRUCTIONS mention specific restaurants for specific dates/meals, USE THOSE EXACTLY

Create a comprehensive dining plan with:

1. Intake summary - infer preferences from the user's top-rated restaurants AND user instructions:
   - Popular cuisines from their history
   - Common vibes (romantic, trendy, classic, view, hidden gem)
   - Typical price range (€, €€, €€€, €€€€)
   - Must-try dishes they enjoyed before or mentioned in instructions
   - Any constraints to consider
   - meals_to_plan should be ${dateList.length > 0 ? dateList.length * 2 : 10} (lunch + dinner for each day)

2. Restaurant recommendations (${dateList.length > 0 ? Math.max(dateList.length * 2, 8) : 8}-12 total):
   - PRIORITY: Include ALL restaurants mentioned in user instructions first
   - Then add your own suggestions using your knowledge of ${city} restaurants
   - Match the user's inferred taste profile
   - Provide: name, cuisine, vibe keywords, price level, one-line highlight (≤140 chars), why it fits their profile, reservation likelihood
   - Group into 3 buckets: "Sure bets" (safe choices), "On-trend now" (popular spots), "Wildcards" (unique finds)
   - Include google_place_id when possible and area_hint for location

3. Proposed schedule:
   - MUST include EXACTLY ${dateList.length > 0 ? dateList.length * 2 : 10} slots (lunch AND dinner for EACH day)
   - Use the EXACT dates provided: ${dateList.join(', ') || 'D1, D2, D3...'}
   - PRIORITY: Use restaurants from user instructions for the dates/meals they specified
   - Order: first all lunches and dinners for first date, then second date, etc.
   - Example for 2025-12-27: first {"day": "2025-12-27", "meal": "Almoço", ...}, then {"day": "2025-12-27", "meal": "Jantar", ...}
   - Mark which meals need reservations (unless user says "Reserva Confirmada")
   - Add helpful notes from user instructions or for timing/logistics

4. Next actions:
   - Suggest 2-3 helpful next steps (e.g., "Confirm slots", "Request reservations", "Adjust schedule")`;
}

function buildRefinementPrompt(data: any, userTopRated: any[]) {
  const { city, intake, existing_recommendations = [], language = 'en-US' } = data;
  
  return `You are Évoque's trip dining concierge. Refine restaurant recommendations for ${city}.

Respond in ${language === 'pt-BR' ? 'Portuguese (Brazil)' : 'English (US)'} language only.

IMPORTANT: You must return structured data using the refine_recommendations function.

Context:
- City: ${city}
- Updated intake preferences: ${JSON.stringify(intake)}
- User's taste profile from top-rated restaurants: ${JSON.stringify(userTopRated)}
- Current recommendations (for reference): ${JSON.stringify(existing_recommendations)}

Generate NEW restaurant recommendations (8 total) based on the updated intake:
- Use your knowledge of ${city} restaurants
- Match the updated preferences: cuisines ${JSON.stringify(intake.cuisines)}, vibe ${JSON.stringify(intake.vibe)}, price ${intake.price}
- Consider must-try dishes: ${JSON.stringify(intake.must_try)}
- Respect constraints: ${JSON.stringify(intake.constraints)}
- Additional notes: ${intake.additional_notes || 'none'}
- Provide: name, cuisine, vibe keywords, price level, one-line highlight (≤140 chars), why it fits their profile, reservation likelihood
- Group into 3 buckets:
  * 3 "Sure bets" (classic, reliable choices)
  * 3 "On-trend now" (currently popular spots)
  * 2 "Wildcards" (unique or surprising finds)
- Include google_place_id when possible and area_hint for location
- Keep highlights concise (≤140 characters)`;
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
