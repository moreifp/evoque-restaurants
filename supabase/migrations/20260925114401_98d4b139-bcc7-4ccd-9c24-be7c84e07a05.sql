CREATE TABLE public.embed_pass_uses (
  jti text PRIMARY KEY,
  client_id text NOT NULL,
  email text,
  used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
GRANT ALL ON public.embed_pass_uses TO service_role;
ALTER TABLE public.embed_pass_uses ENABLE ROW LEVEL SECURITY;