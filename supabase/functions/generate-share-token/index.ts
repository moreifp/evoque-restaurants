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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization')!;
    
    // Use anon key with user's JWT for ownership verification
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    // Use service role for token operations (bypasses RLS after ownership is verified)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { entry_id } = await req.json();

    if (!entry_id) {
      return new Response(
        JSON.stringify({ error: 'entry_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating token for entry_id:', entry_id);

    // Verify that the authenticated user owns this entry
    const { data: entry, error: entryError } = await supabaseUser
      .from('restaurant_entries')
      .select('id, user_id')
      .eq('id', entry_id)
      .maybeSingle();

    if (entryError) {
      console.error('Error checking entry ownership:', entryError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify entry ownership' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!entry) {
      console.log('Entry not found or user does not own it:', entry_id);
      return new Response(
        JSON.stringify({ error: 'Entry not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Ownership verified for entry:', entry_id);

    // Check if token already exists for this entry (use admin client)
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('share_tokens')
      .select('token')
      .eq('entry_id', entry_id)
      .single();

    if (existing && !existingError) {
      console.log('Reusing existing token:', existing.token);
      return new Response(
        JSON.stringify({ token: existing.token }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a unique short token (8 characters to match constraint)
    const generateToken = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      const length = 8;
      let token = '';
      for (let i = 0; i < length; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return token;
    };

    let token = generateToken();
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure token is unique
    while (attempts < maxAttempts) {
      const { data: existingToken } = await supabaseAdmin
        .from('share_tokens')
        .select('id')
        .eq('token', token)
        .single();

      if (!existingToken) {
        break;
      }

      token = generateToken();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate unique token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new token
    const { data, error } = await supabaseAdmin
      .from('share_tokens')
      .insert({ token, entry_id })
      .select('token')
      .single();

    if (error) {
      console.error('Error creating token:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully generated token:', data.token);

    return new Response(
      JSON.stringify({ token: data.token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-share-token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
