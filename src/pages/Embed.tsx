import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";

function parentOrigin(): string | null {
  const a = (window.location as any).ancestorOrigins as DOMStringList | undefined;
  if (a && a.length > 0) return a.item(0);
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

const Embed = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useI18n();
  const [error, setError] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get("token") || params.get("pass");
    const clientId = params.get("client_id") || "evoque-viagens";
    const next = params.get("next");
    // Remove the pass from the address bar immediately
    window.history.replaceState(null, "", "/embed");
    sessionStorage.setItem("evoque_embedded", "1");

    (async () => {
      if (!token) {
        const { data } = await supabase.auth.getSession();
        if (data.session) return navigate("/", { replace: true });
        return setError(true);
      }
      const { data, error } = await supabase.functions.invoke("embed-exchange", {
        body: { token, client_id: clientId, host_origin: parentOrigin() },
      });
      if (error || !data?.access_token) return setError(true);
      const { error: sErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sErr) return setError(true);
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      window.location.replace(safeNext);
    })();
  }, [params, navigate]);

  const pt = language === "pt";
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-6">
      <div className="text-center max-w-sm">
        <div className={`w-16 h-16 rounded-lg bg-gradient-olive-teal mx-auto mb-4 ${error ? "" : "animate-pulse"}`} />
        {error ? (
          <>
            <p className="font-semibold mb-1">{pt ? "Não foi possível entrar" : "Couldn't sign you in"}</p>
            <p className="text-sm text-muted-foreground">
              {pt
                ? "O link de acesso expirou ou já foi usado. Volte ao Evoque Viagens e abra novamente."
                : "This access link expired or was already used. Go back to Evoque Viagens and open it again."}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">{pt ? "Entrando..." : "Signing in..."}</p>
        )}
      </div>
    </div>
  );
};

export default Embed;
