import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          state?: string;
          nonce?: string;
          usePopup: boolean;
        }) => void;
        signIn: () => Promise<{
          authorization: {
            code: string;
            id_token: string;
            state?: string;
          };
          user?: {
            email: string;
            name: {
              firstName: string;
              lastName: string;
            };
          };
        }>;
      };
    };
  }
}

const APPLE_CLIENT_ID = "app.lovable.385321039a9345e2934908e3a7564453.appleauth";

const getRedirectUri = () => `${window.location.origin}/callback/apple`;

export function useAppleAuth() {
  const [loading, setLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const { toast } = useToast();

  // Load Apple JS script
  useEffect(() => {
    if (document.getElementById("apple-signin-script")) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "apple-signin-script";
    script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    script.onload = () => {
      setScriptLoaded(true);
    };
    script.onerror = () => {
      console.error("Failed to load Apple Sign In script");
    };
    document.head.appendChild(script);

    return () => {
      // Don't remove script on unmount to avoid reloading
    };
  }, []);

  // Initialize Apple Auth when script is loaded
  useEffect(() => {
    if (!scriptLoaded || !window.AppleID) return;

    try {
      window.AppleID.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: "name email",
        redirectURI: getRedirectUri(),
        usePopup: true,
      });
    } catch (error) {
      console.error("Failed to initialize Apple Sign In:", error);
    }
  }, [scriptLoaded]);

  const signInWithApple = useCallback(async () => {
    if (!scriptLoaded || !window.AppleID) {
      toast({
        title: "Error",
        description: "Apple Sign In is not ready. Please try again.",
        variant: "destructive",
      });
      return false;
    }

    setLoading(true);

    try {
      // Trigger Apple Sign In popup
      console.log('[AppleAuth] Calling window.AppleID.auth.signIn()...');
      const response = await window.AppleID.auth.signIn();
      console.log('[AppleAuth] Apple popup returned successfully');
      console.log('[AppleAuth] Has authorization:', !!response.authorization);
      console.log('[AppleAuth] Has user info:', !!response.user);

      const { authorization, user } = response;

      // Call our edge function to complete authentication
      const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apple-auth-callback`;
      console.log('[AppleAuth] Calling edge function:', edgeFunctionUrl);
      
      const authResponse = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          authorization_code: authorization.code,
          id_token: authorization.id_token,
          user_info: user,
          redirect_uri: getRedirectUri(),
        }),
      });

      console.log('[AppleAuth] Edge function response status:', authResponse.status);
      const authData = await authResponse.json();
      console.log('[AppleAuth] Edge function response:', JSON.stringify(authData).substring(0, 200));

      if (!authResponse.ok || authData.error) {
        throw new Error(authData.error || "Authentication failed");
      }

      // Set the session in Supabase client
      if (authData.session) {
        console.log('[AppleAuth] Setting session...');
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
        });

        if (sessionError) {
          console.error('[AppleAuth] Session error:', sessionError);
          throw sessionError;
        }

        console.log('[AppleAuth] Session set successfully!');
        return true;
      }

      throw new Error("No session returned from server");
    } catch (error: any) {
      console.error("[AppleAuth] Error:", error);
      console.error("[AppleAuth] Error type:", typeof error);
      console.error("[AppleAuth] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      
      // Don't show error for user cancellation
      if (error.error !== "popup_closed_by_user") {
        toast({
          title: "Sign In Failed",
          description: error.message || "Failed to sign in with Apple",
          variant: "destructive",
        });
      }
      
      return false;
    } finally {
      setLoading(false);
    }
  }, [scriptLoaded, toast]);

  return {
    signInWithApple,
    loading,
    isReady: scriptLoaded,
  };
}
