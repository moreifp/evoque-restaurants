import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrichRequest {
  restaurant_name: string;
  city: string;
  google_place_id?: string;
}

interface EnrichedData {
  google_place_id: string | null;
  location_address: string | null;
  phone: string | null;
  website: string | null;
  maps_url: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!GOOGLE_PLACES_API_KEY) {
      console.error('GOOGLE_PLACES_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Google Places API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { restaurant_name, city, google_place_id }: EnrichRequest = await req.json();
    
    if (!restaurant_name || !city) {
      return new Response(
        JSON.stringify({ error: 'restaurant_name and city are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Enriching data for: ${restaurant_name} in ${city}, place_id: ${google_place_id || 'none'}`);

    let placeId: string | null = google_place_id || null;
    let enrichedData: EnrichedData = {
      google_place_id: null,
      location_address: null,
      phone: null,
      website: null,
      maps_url: null,
    };

    // Step 1: If we have a place_id, try to validate it with Place Details
    if (placeId) {
      console.log(`Validating existing place_id: ${placeId}`);
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=place_id,formatted_address,formatted_phone_number,website,url,name&key=${GOOGLE_PLACES_API_KEY}`;
      
      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json();
      
      if (detailsData.status === 'OK' && detailsData.result) {
        const result = detailsData.result;
        console.log(`Place Details found: ${result.name}`);
        enrichedData = {
          google_place_id: result.place_id,
          location_address: result.formatted_address || null,
          phone: result.formatted_phone_number || null,
          website: result.website || null,
          maps_url: result.url || null,
        };
        
        return new Response(
          JSON.stringify({ success: true, data: enrichedData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log(`Place Details failed for place_id ${placeId}: ${detailsData.status}`);
        // Place ID invalid, try text search
        placeId = null;
      }
    }

    // Step 2: Use Text Search to find the restaurant
    const searchQuery = `${restaurant_name} restaurant ${city}`;
    console.log(`Searching with query: ${searchQuery}`);
    
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=restaurant&key=${GOOGLE_PLACES_API_KEY}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (searchData.status === 'OK' && searchData.results && searchData.results.length > 0) {
      // Get the first result's place_id
      const firstResult = searchData.results[0];
      const foundPlaceId: string = firstResult.place_id;
      console.log(`Text Search found: ${firstResult.name} (${placeId})`);
      
      // Step 3: Get detailed info using Place Details
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(foundPlaceId)}&fields=place_id,formatted_address,formatted_phone_number,website,url,name&key=${GOOGLE_PLACES_API_KEY}`;
      
      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json();
      
      if (detailsData.status === 'OK' && detailsData.result) {
        const result = detailsData.result;
        console.log(`Place Details enriched: ${result.formatted_address}`);
        enrichedData = {
          google_place_id: result.place_id,
          location_address: result.formatted_address || null,
          phone: result.formatted_phone_number || null,
          website: result.website || null,
          maps_url: result.url || null,
        };
      } else {
        // Use basic info from text search
        enrichedData = {
          google_place_id: foundPlaceId,
          location_address: firstResult.formatted_address || null,
          phone: null,
          website: null,
          maps_url: `https://www.google.com/maps/place/?q=place_id:${foundPlaceId}`,
        };
      }
    } else {
      console.log(`No results found for: ${searchQuery}, status: ${searchData.status}`);
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
