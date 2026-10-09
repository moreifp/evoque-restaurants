-- Recursos de IA sempre ligados para todos (sem chave nas Configurações).
-- Lista de escopos vazia = todos os recursos. O histórico em ai_consent_logs fica como está.
ALTER TABLE public.profiles ALTER COLUMN ai_consent SET DEFAULT true;
UPDATE public.profiles
   SET ai_consent = true,
       ai_consent_scopes = '{}',
       ai_consent_timestamp = COALESCE(ai_consent_timestamp, now())
 WHERE ai_consent IS DISTINCT FROM true OR ai_consent_scopes IS DISTINCT FROM '{}';
