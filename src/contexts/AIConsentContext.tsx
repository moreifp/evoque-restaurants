import { createContext, useContext, useMemo, ReactNode } from "react";

/**
 * Recursos de IA sempre ligados para todo mundo (decisão do dono, 10/10/2026).
 * Não há mais modal nem chave nas Configurações; valores antigos salvos como
 * `false` em profiles.ai_consent são ignorados. A API continua igual para
 * quem chama `ensureAIConsent` (sempre devolve true).
 */
export type AIConsentScope = "wine_recognition" | "menu_translation" | "invoice_transcription" | "recommendations";

interface AIConsentState {
  aiConsent: boolean;
  aiConsentScopes: string[];
  loaded: boolean;
}

interface AIConsentContextType {
  ensureAIConsent: (scope: AIConsentScope) => Promise<boolean>;
  consentState: AIConsentState;
}

const ALWAYS_ON: AIConsentContextType = {
  ensureAIConsent: async () => true,
  consentState: { aiConsent: true, aiConsentScopes: [], loaded: true },
};

const AIConsentContext = createContext<AIConsentContextType>(ALWAYS_ON);

export function useAIConsent() {
  return useContext(AIConsentContext);
}

export function AIConsentProvider({ children }: { children: ReactNode; userId?: string | null }) {
  const value = useMemo(() => ALWAYS_ON, []);
  return <AIConsentContext.Provider value={value}>{children}</AIConsentContext.Provider>;
}
