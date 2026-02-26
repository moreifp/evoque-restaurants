import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";

export type AIConsentScope = "wine_recognition" | "menu_translation" | "invoice_transcription" | "recommendations";

interface AIConsentState {
  aiConsent: boolean;
  aiConsentScopes: string[];
  loaded: boolean;
}

interface AIConsentContextType {
  ensureAIConsent: (scope: AIConsentScope) => Promise<boolean>;
  consentState: AIConsentState;
  refreshConsent: () => Promise<void>;
  withdrawAllConsent: () => Promise<void>;
  toggleGlobalConsent: (enabled: boolean) => Promise<void>;
}

interface ModalRequest {
  scope: AIConsentScope;
  resolve: (allowed: boolean) => void;
}

const AIConsentContext = createContext<AIConsentContextType | null>(null);

export function useAIConsent() {
  const ctx = useContext(AIConsentContext);
  if (!ctx) throw new Error("useAIConsent must be used within AIConsentProvider");
  return ctx;
}

// Export modal state for AIConsentModal to consume
let _modalRequest: ModalRequest | null = null;
let _setModalOpen: ((req: ModalRequest | null) => void) | null = null;

export function getModalRequest() { return _modalRequest; }
export function setModalRequestSetter(setter: (req: ModalRequest | null) => void) { _setModalOpen = setter; }

export function AIConsentProvider({ children, userId }: { children: ReactNode; userId: string | null }) {
  const [consentState, setConsentState] = useState<AIConsentState>({ aiConsent: false, aiConsentScopes: [], loaded: false });
  const { toast } = useToast();
  const { t } = useI18n();
  const pendingRef = useRef<ModalRequest | null>(null);

  const fetchConsent = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("profiles")
      .select("ai_consent, ai_consent_scopes")
      .eq("id", userId)
      .single();
    if (data) {
      setConsentState({
        aiConsent: (data as any).ai_consent ?? false,
        aiConsentScopes: (data as any).ai_consent_scopes ?? [],
        loaded: true,
      });
    }
  }, [userId]);

  useEffect(() => { fetchConsent(); }, [fetchConsent]);

  const ensureAIConsent = useCallback(async (scope: AIConsentScope): Promise<boolean> => {
    // Check cached state
    if (consentState.aiConsent && (consentState.aiConsentScopes.length === 0 || consentState.aiConsentScopes.includes(scope))) {
      return true;
    }

    // Show modal and wait for user decision
    return new Promise<boolean>((resolve) => {
      const req: ModalRequest = { scope, resolve };
      pendingRef.current = req;
      _modalRequest = req;
      _setModalOpen?.(req);
    });
  }, [consentState]);

  const handleAllow = useCallback(async (scope: AIConsentScope) => {
    if (!userId) return;
    const newScopes = consentState.aiConsentScopes.includes(scope)
      ? consentState.aiConsentScopes
      : [...consentState.aiConsentScopes, scope];

    await supabase.from("profiles").update({
      ai_consent: true,
      ai_consent_timestamp: new Date().toISOString(),
      ai_consent_version: "2026-02-26",
      ai_consent_scopes: newScopes,
    } as any).eq("id", userId);

    await supabase.from("ai_consent_logs" as any).insert({
      user_id: userId,
      scope,
      allowed: true,
      policy_version: "2026-02-26",
      device_info: navigator.userAgent,
    });

    setConsentState({ aiConsent: true, aiConsentScopes: newScopes, loaded: true });
    pendingRef.current?.resolve(true);
    pendingRef.current = null;
    _modalRequest = null;
    _setModalOpen?.(null);
  }, [userId, consentState]);

  const handleRefuse = useCallback(async (scope: AIConsentScope) => {
    if (!userId) return;
    await supabase.from("ai_consent_logs" as any).insert({
      user_id: userId,
      scope,
      allowed: false,
      policy_version: "2026-02-26",
      device_info: navigator.userAgent,
    });

    toast({
      title: t("aiConsent.aiOff"),
      description: t("aiConsent.aiOffDesc"),
    });

    pendingRef.current?.resolve(false);
    pendingRef.current = null;
    _modalRequest = null;
    _setModalOpen?.(null);
  }, [userId, toast, t]);

  const withdrawAllConsent = useCallback(async () => {
    if (!userId) return;
    await supabase.from("profiles").update({
      ai_consent: false,
      ai_consent_scopes: [],
      ai_consent_timestamp: new Date().toISOString(),
    } as any).eq("id", userId);

    await supabase.from("ai_consent_logs" as any).insert({
      user_id: userId,
      scope: "withdraw_all",
      allowed: false,
      policy_version: "2026-02-26",
      device_info: navigator.userAgent,
    });

    setConsentState({ aiConsent: false, aiConsentScopes: [], loaded: true });
  }, [userId]);

  const toggleGlobalConsent = useCallback(async (enabled: boolean) => {
    if (!userId) return;
    if (enabled) {
      await supabase.from("profiles").update({
        ai_consent: true,
        ai_consent_timestamp: new Date().toISOString(),
        ai_consent_version: "2026-02-26",
      } as any).eq("id", userId);

      await supabase.from("ai_consent_logs" as any).insert({
        user_id: userId,
        scope: "global_enable",
        allowed: true,
        policy_version: "2026-02-26",
        device_info: navigator.userAgent,
      });

      setConsentState(prev => ({ ...prev, aiConsent: true }));
    } else {
      await withdrawAllConsent();
    }
  }, [userId, withdrawAllConsent]);

  // Expose handlers for modal
  useEffect(() => {
    (window as any).__aiConsentHandlers = { handleAllow, handleRefuse };
    return () => { delete (window as any).__aiConsentHandlers; };
  }, [handleAllow, handleRefuse]);

  return (
    <AIConsentContext.Provider value={{ ensureAIConsent, consentState, refreshConsent: fetchConsent, withdrawAllConsent, toggleGlobalConsent }}>
      {children}
    </AIConsentContext.Provider>
  );
}
