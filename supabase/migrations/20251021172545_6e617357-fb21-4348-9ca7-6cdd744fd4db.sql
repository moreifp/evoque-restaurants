-- Create plans table for restaurant trip planning
CREATE TABLE public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  city TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  intake_json JSONB,
  recommendations_json JSONB,
  schedule_json JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create plan_slots table for individual restaurant bookings
CREATE TABLE public.plan_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL,
  date DATE NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('Lunch', 'Dinner')),
  restaurant_name TEXT NOT NULL,
  google_place_id TEXT,
  reservation_required BOOLEAN NOT NULL DEFAULT false,
  has_reservation BOOLEAN NOT NULL DEFAULT false,
  reservation_code TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create restaurant_notes table for AI-generated summaries
CREATE TABLE public.restaurant_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_name TEXT NOT NULL,
  google_place_id TEXT,
  summary_240 TEXT,
  tags TEXT[],
  rating_user NUMERIC(2,1),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(restaurant_name, google_place_id)
);

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_notes ENABLE ROW LEVEL SECURITY;

-- Plans policies
CREATE POLICY "Users can view their own plans"
  ON public.plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own plans"
  ON public.plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plans"
  ON public.plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own plans"
  ON public.plans FOR DELETE
  USING (auth.uid() = user_id);

-- Plan slots policies
CREATE POLICY "Users can view plan slots for their plans"
  ON public.plan_slots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM plans WHERE plans.id = plan_slots.plan_id AND plans.user_id = auth.uid()
  ));

CREATE POLICY "Users can create plan slots for their plans"
  ON public.plan_slots FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM plans WHERE plans.id = plan_slots.plan_id AND plans.user_id = auth.uid()
  ));

CREATE POLICY "Users can update plan slots for their plans"
  ON public.plan_slots FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM plans WHERE plans.id = plan_slots.plan_id AND plans.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete plan slots for their plans"
  ON public.plan_slots FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM plans WHERE plans.id = plan_slots.plan_id AND plans.user_id = auth.uid()
  ));

-- Restaurant notes policies
CREATE POLICY "Users can view all restaurant notes"
  ON public.restaurant_notes FOR SELECT
  USING (true);

CREATE POLICY "Users can create restaurant notes"
  ON public.restaurant_notes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update restaurant notes"
  ON public.restaurant_notes FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Add triggers for updated_at
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plan_slots_updated_at
  BEFORE UPDATE ON public.plan_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_restaurant_notes_updated_at
  BEFORE UPDATE ON public.restaurant_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();