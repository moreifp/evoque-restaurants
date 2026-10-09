// Login social pelo Supabase (antes era pelo Lovable).
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple", opts?: SignInOptions) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: opts?.redirect_uri ?? window.location.origin, queryParams: opts?.extraParams },
      });
      return error ? { error } : { redirected: true as const };
    },
  },
};
