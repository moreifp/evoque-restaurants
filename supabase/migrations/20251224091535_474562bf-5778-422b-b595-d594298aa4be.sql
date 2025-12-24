-- Create scheduled_visits table for the Agenda module
CREATE TABLE public.scheduled_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  restaurant_name TEXT NOT NULL,
  google_place_id TEXT,
  location_address TEXT,
  phone TEXT,
  website TEXT,
  maps_url TEXT,
  city TEXT NOT NULL,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'dinner',
  status TEXT NOT NULL DEFAULT 'planned',
  party_size INTEGER,
  booking_ref TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  ai_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_visits ENABLE ROW LEVEL SECURITY;

-- RLS policies for scheduled_visits
CREATE POLICY "Users can view their own scheduled visits"
ON public.scheduled_visits FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled visits"
ON public.scheduled_visits FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled visits"
ON public.scheduled_visits FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled visits"
ON public.scheduled_visits FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_scheduled_visits_updated_at
BEFORE UPDATE ON public.scheduled_visits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add instructions column to plans table for AI Planner enhancement
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS instructions TEXT;

-- Add origin_scheduled_visit_id to restaurant_entries for linking experiences
ALTER TABLE public.restaurant_entries ADD COLUMN IF NOT EXISTS origin_scheduled_visit_id UUID REFERENCES public.scheduled_visits(id) ON DELETE SET NULL;