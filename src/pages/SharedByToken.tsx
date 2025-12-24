import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SharedByToken = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validateAndRedirect = async () => {
      if (!token) {
        navigate("/token");
        return;
      }

      try {
        console.log('Validating token:', token);

        // Use secure edge function to validate token
        const { data, error } = await supabase.functions.invoke('validate-share-token', {
          body: { token: token.trim().toLowerCase() }
        });

        if (error || !data?.valid) {
          console.log('Token validation failed:', error?.message || data?.error);
          navigate("/token");
          return;
        }

        // Redirect to the shared restaurant page
        console.log('Token valid, redirecting to entry:', data.entry_id);
        navigate(`/share/${data.entry_id}`);

      } catch (error) {
        console.error('Error validating token:', error);
        navigate("/token");
      } finally {
        setLoading(false);
      }
    };

    validateAndRedirect();
  }, [token, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <div className="w-16 h-16 rounded-lg bg-gradient-olive-teal mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Verificando link...</p>
        </div>
      </div>
    );
  }

  return null;
};

export default SharedByToken;
