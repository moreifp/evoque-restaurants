import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function AppleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get parameters from URL (for redirect flow, not popup)
        const code = searchParams.get("code");
        const idToken = searchParams.get("id_token");
        const errorParam = searchParams.get("error");

        if (errorParam) {
          throw new Error(errorParam);
        }

        // If we have code, process it (redirect flow)
        if (code) {
          // Get user info from POST body if available (Apple sends it as form data)
          let userInfo = null;
          const userParam = searchParams.get("user");
          if (userParam) {
            try {
              userInfo = JSON.parse(userParam);
            } catch {
              // User info not available
            }
          }

          const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apple-auth-callback`;

          const authResponse = await fetch(edgeFunctionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              authorization_code: code,
              id_token: idToken,
              user_info: userInfo,
              redirect_uri: window.location.origin + "/callback/apple",
            }),
          });

          const authData = await authResponse.json();

          if (!authResponse.ok || authData.error) {
            throw new Error(authData.error || "Authentication failed");
          }

          // Set the session
          if (authData.session) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: authData.session.access_token,
              refresh_token: authData.session.refresh_token,
            });

            if (sessionError) {
              throw sessionError;
            }

            toast({
              title: "Success",
              description: "Signed in with Apple successfully",
            });

            navigate("/", { replace: true });
            return;
          }
        }

        // If no code, this might be from popup flow - just redirect
        navigate("/", { replace: true });
      } catch (err: any) {
        console.error("Apple callback error:", err);
        setError(err.message || "Authentication failed");
        toast({
          title: "Sign In Failed",
          description: err.message || "Failed to complete Apple Sign In",
          variant: "destructive",
        });
        
        // Redirect to home after error
        setTimeout(() => {
          navigate("/", { replace: true });
        }, 3000);
      } finally {
        setProcessing(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
      <div className="text-center p-8">
        {processing ? (
          <>
            <div className="w-16 h-16 rounded-lg bg-gradient-olive-teal mx-auto mb-4 animate-pulse" />
            <p className="text-muted-foreground">Completing sign in...</p>
          </>
        ) : error ? (
          <>
            <div className="w-16 h-16 rounded-lg bg-destructive/20 mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-destructive font-medium">{error}</p>
            <p className="text-muted-foreground mt-2">Redirecionando...</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-lg bg-green-500/20 mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">✓</span>
            </div>
            <p className="text-muted-foreground">Success! Redirecting...</p>
          </>
        )}
      </div>
    </div>
  );
}
