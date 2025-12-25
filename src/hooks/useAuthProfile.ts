import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export function useAuthProfile() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const ensureProfileExists = useCallback(async (session: Session) => {
    if (!session?.user) return;

    const { error } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", session.user.id)
      .single();

    if (error?.code === "PGRST116") {
      // Profile doesn't exist, create one
      const displayName =
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        session.user.email?.split("@")[0] ||
        "User";

      await supabase.from("profiles").insert({
        id: session.user.id,
        display_name: displayName,
      });
    }
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);

      if (session) {
        ensureProfileExists(session);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);

      if (session) {
        // Slight delay to ensure auth is fully processed
        setTimeout(() => ensureProfileExists(session), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [ensureProfileExists]);

  return { session, loading, isAuthenticated: !!session };
}
