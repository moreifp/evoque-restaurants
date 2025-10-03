-- Add tables for receipt OCR functionality

-- Create receipts table
CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.restaurant_entries(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  ocr_raw_text TEXT,
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2),
  service_fee DECIMAL(10,2),
  total DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create receipt_items table for parsed dishes and drinks
CREATE TABLE IF NOT EXISTS public.receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('dish', 'drink')),
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10,2),
  line_total DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for receipts
CREATE POLICY "Users can view receipts for their own entries"
  ON public.receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = receipts.entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create receipts for their own entries"
  ON public.receipts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = receipts.entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update receipts for their own entries"
  ON public.receipts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = receipts.entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete receipts for their own entries"
  ON public.receipts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_entries
      WHERE restaurant_entries.id = receipts.entry_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

-- RLS policies for receipt_items
CREATE POLICY "Users can view receipt items for their own entries"
  ON public.receipt_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.receipts
      JOIN public.restaurant_entries ON restaurant_entries.id = receipts.entry_id
      WHERE receipts.id = receipt_items.receipt_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create receipt items for their own entries"
  ON public.receipt_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.receipts
      JOIN public.restaurant_entries ON restaurant_entries.id = receipts.entry_id
      WHERE receipts.id = receipt_items.receipt_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update receipt items for their own entries"
  ON public.receipt_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.receipts
      JOIN public.restaurant_entries ON restaurant_entries.id = receipts.entry_id
      WHERE receipts.id = receipt_items.receipt_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete receipt items for their own entries"
  ON public.receipt_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.receipts
      JOIN public.restaurant_entries ON restaurant_entries.id = receipts.entry_id
      WHERE receipts.id = receipt_items.receipt_id
      AND restaurant_entries.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX idx_receipts_entry_id ON public.receipts(entry_id);
CREATE INDEX idx_receipt_items_receipt_id ON public.receipt_items(receipt_id);