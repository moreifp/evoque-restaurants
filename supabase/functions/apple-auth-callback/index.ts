import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate Apple client_secret JWT
async function generateClientSecret(
  teamId: string,
  keyId: string,
  privateKey: string,
  clientId: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86400 * 180; // 180 days

  const header = {
    alg: "ES256",
    kid: keyId,
    typ: "JWT",
  };

  const payload = {
    iss: teamId,
    iat: now,
    exp: exp,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };

  // Base64url encode
  const base64url = (data: string) => {
    return btoa(data)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the private key
  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign"]
  );

  // Sign the JWT
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    cryptoKey,
    encoder.encode(signingInput)
  );

  // Convert signature to correct format (Apple expects raw r||s format)
  const signatureArray = new Uint8Array(signatureBuffer);
  const signatureB64 = base64url(String.fromCharCode(...signatureArray));

  return `${signingInput}.${signatureB64}`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { authorization_code, id_token, user_info, redirect_uri } = await req.json();

    if (!authorization_code) {
      return new Response(
        JSON.stringify({ error: "Missing authorization_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Apple credentials from environment
    const teamId = Deno.env.get("APPLE_TEAM_ID");
    const keyId = Deno.env.get("APPLE_KEY_ID");
    const privateKey = Deno.env.get("APPLE_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!teamId || !keyId || !privateKey) {
      console.error("Missing Apple credentials");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Apple Service ID (client_id for web)
    const clientId = "app.lovable.385321039a9345e2934908e3a7564453.appleauth";

    // Generate client_secret
    const clientSecret = await generateClientSecret(teamId, keyId, privateKey, clientId);

    // Exchange authorization_code for tokens with Apple
    const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: authorization_code,
        grant_type: "authorization_code",
        redirect_uri: redirect_uri || "https://evoquebyfausto.lovable.app/callback/apple",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Apple token error:", tokenData);
      return new Response(
        JSON.stringify({ error: tokenData.error_description || tokenData.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode Apple's id_token to get user info
    const appleIdToken = tokenData.id_token || id_token;
    const tokenParts = appleIdToken.split(".");
    const payloadB64 = tokenParts[1];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));

    const appleUserId = payload.sub;
    const email = payload.email;
    const emailVerified = payload.email_verified === "true" || payload.email_verified === true;

    // Get user's name from user_info (only available on first login)
    let displayName = "";
    if (user_info?.name) {
      const { firstName, lastName } = user_info.name;
      displayName = [firstName, lastName].filter(Boolean).join(" ");
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if user exists by email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    let existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;
    let session: any;

    if (existingUser) {
      // User exists, create a session
      userId = existingUser.id;
      
      // Generate a new session for existing user
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: email,
      });

      if (signInError) {
        console.error("Error generating session:", signInError);
        throw signInError;
      }

      // Extract token from the link and create session
      const token = new URL(signInData.properties.action_link).searchParams.get("token");
      
      // Verify the token to create a session
      const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
        token_hash: token!,
        type: "magiclink",
      });

      if (verifyError) {
        console.error("Error verifying OTP:", verifyError);
        throw verifyError;
      }

      session = verifyData.session;
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        email_confirm: emailVerified,
        user_metadata: {
          display_name: displayName,
          apple_user_id: appleUserId,
          provider: "apple",
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        throw createError;
      }

      userId = newUser.user.id;

      // Create profile
      await supabaseAdmin.from("profiles").insert({
        id: userId,
        display_name: displayName || email?.split("@")[0] || "Apple User",
      });

      // Generate session for new user
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: email,
      });

      if (signInError) throw signInError;

      const token = new URL(signInData.properties.action_link).searchParams.get("token");
      
      const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
        token_hash: token!,
        type: "magiclink",
      });

      if (verifyError) throw verifyError;

      session = verifyData.session;
    }

    return new Response(
      JSON.stringify({
        success: true,
        session: session,
        user_id: userId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Apple auth error:", error);
    const errorMessage = error instanceof Error ? error.message : "Authentication failed";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
