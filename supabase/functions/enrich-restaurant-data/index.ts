import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrichRequest {
  restaurant_name?: string;
  city?: string;
  google_place_id?: string;
}

interface EnrichedData {
  google_place_id: string | null;
  location_address: string | null;
  phone: string | null;
  website: string | null;
  maps_url: string | null;
  city: string | null;
}

// Extract city from address components
function extractCity(addressComponents: any[]): string | null {
  if (!addressComponents) return null;
  
  const cityTypes = ['locality', 'administrative_area_level_2', 'administrative_area_level_1'];
  
  for (const type of cityTypes) {
    const component = addressComponents.find((c: any) => c.types?.includes(type));
    if (component) {
      return component.long_name;
    }
  }
  return null;
}

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

    const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!GOOGLE_PLACES_API_KEY) {
      console.error('GOOGLE_PLACES_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Google Places API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { restaurant_name, city, google_place_id }: EnrichRequest = await req.json();
    
    // Allow either google_place_id alone OR restaurant_name + city
    if (!google_place_id && (!restaurant_name || !city)) {
      return new Response(
        JSON.stringify({ error: 'Either google_place_id or (restaurant_name and city) are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Enriching data for: ${restaurant_name || 'N/A'} in ${city || 'N/A'}, place_id: ${google_place_id || 'none'}`);

    let enrichedData: EnrichedData = {
      google_place_id: null,
      location_address: null,
      phone: null,
      website: null,
      maps_url: null,
      city: null,
    };

    // Step 1: If we have a place_id, get details directly
    if (google_place_id) {
      console.log(`Fetching details for place_id: ${google_place_id}`);
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(google_place_id)}&fields=place_id,formatted_address,formatted_phone_number,website,url,name,address_components&key=${GOOGLE_PLACES_API_KEY}`;
      
      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json();
      
      console.log(`Place Details API response status: ${detailsData.status}`);
      
      if (detailsData.status === 'OK' && detailsData.result) {
        const result = detailsData.result;
        const extractedCity = extractCity(result.address_components);
        console.log(`Place Details found: ${result.name}, city: ${extractedCity}`);
        
        enrichedData = {
          google_place_id: result.place_id,
          location_address: result.formatted_address || null,
          phone: result.formatted_phone_number || null,
          website: result.website || null,
          maps_url: result.url || null,
          city: extractedCity,
        };
        
        return new Response(
          JSON.stringify({ success: true, data: enrichedData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log(`Place Details failed for place_id ${google_place_id}: ${detailsData.status}, error: ${detailsData.error_message || 'none'}`);
        // If place_id lookup failed but we have name/city, try text search
        if (!restaurant_name || !city) {
          return new Response(
            JSON.stringify({ success: false, error: `Place not found: ${detailsData.status}`, data: enrichedData }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Step 2: Use Text Search to find the restaurant (fallback or primary if no place_id)
    if (restaurant_name && city) {
      const searchQuery = `${restaurant_name} restaurant ${city}`;
      console.log(`Searching with query: ${searchQuery}`);
      
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=restaurant&key=${GOOGLE_PLACES_API_KEY}`;
      
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();
      
      console.log(`Text Search API response status: ${searchData.status}, results: ${searchData.results?.length || 0}`);
      
      if (searchData.status === 'OK' && searchData.results && searchData.results.length > 0) {
        const firstResult = searchData.results[0];
        const foundPlaceId: string = firstResult.place_id;
        console.log(`Text Search found: ${firstResult.name} (${foundPlaceId})`);
        
        // Step 3: Get detailed info using Place Details
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(foundPlaceId)}&fields=place_id,formatted_address,formatted_phone_number,website,url,name,address_components&key=${GOOGLE_PLACES_API_KEY}`;
        
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();
        
        if (detailsData.status === 'OK' && detailsData.result) {
          const result = detailsData.result;
          const extractedCity = extractCity(result.address_components);
          console.log(`Place Details enriched: ${result.formatted_address}, city: ${extractedCity}`);
          
          enrichedData = {
            google_place_id: result.place_id,
            location_address: result.formatted_address || null,
            phone: result.formatted_phone_number || null,
            website: result.website || null,
            maps_url: result.url || null,
            city: extractedCity || city,
          };
        } else {
          // Use basic info from text search
          enrichedData = {
            google_place_id: foundPlaceId,
            location_address: firstResult.formatted_address || null,
            phone: null,
            website: null,
            maps_url: `https://www.google.com/maps/place/?q=place_id:${foundPlaceId}`,
            city: city,
          };
        }
      } else {
        console.log(`No results found for: ${searchQuery}, status: ${searchData.status}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: enrichedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error enriching restaurant data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
