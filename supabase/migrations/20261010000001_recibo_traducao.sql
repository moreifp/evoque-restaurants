-- Recibo: nome do item traduzido para o português (o original fica em `name`).
ALTER TABLE public.receipt_items ADD COLUMN IF NOT EXISTS name_pt text;
