import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Star, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";

interface UnrecordedVisit {
  id: string;
  restaurant_name: string;
  city: string;
  start_datetime: string;
}

export function PastVisitReminderBanner() {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [unrecordedVisits, setUnrecordedVisits] = useState<UnrecordedVisit[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user has dismissed the banner recently
    const dismissedUntil = localStorage.getItem("pastVisitBannerDismissed");
    if (dismissedUntil && new Date(dismissedUntil) > new Date()) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    fetchUnrecordedVisits();
  }, []);

  const fetchUnrecordedVisits = async () => {
    const now = new Date().toISOString();
    
    // Get past completed visits
    const { data: pastVisits } = await supabase
      .from("scheduled_visits")
      .select("id, restaurant_name, city, start_datetime")
      .lt("start_datetime", now)
      .in("status", ["completed", "confirmed", "booked"])
      .order("start_datetime", { ascending: false })
      .limit(5);

    if (!pastVisits || pastVisits.length === 0) {
      setLoading(false);
      return;
    }

    // Check which ones have linked experiences
    const visitIds = pastVisits.map(v => v.id);
    const { data: linkedEntries } = await supabase
      .from("restaurant_entries")
      .select("origin_scheduled_visit_id")
      .in("origin_scheduled_visit_id", visitIds);

    const linkedVisitIds = new Set(linkedEntries?.map(e => e.origin_scheduled_visit_id) || []);
    
    // Filter to only unrecorded visits
    const unrecorded = pastVisits.filter(v => !linkedVisitIds.has(v.id));
    setUnrecordedVisits(unrecorded.slice(0, 2)); // Show max 2
    setLoading(false);
  };

  const handleDismiss = () => {
    // Dismiss for 24 hours
    const dismissUntil = new Date();
    dismissUntil.setHours(dismissUntil.getHours() + 24);
    localStorage.setItem("pastVisitBannerDismissed", dismissUntil.toISOString());
    setDismissed(true);
  };

  const handleRecordExperience = (visit: UnrecordedVisit) => {
    const params = new URLSearchParams({
      restaurant_name: visit.restaurant_name,
      city: visit.city,
      origin_scheduled_visit_id: visit.id,
    });
    navigate(`/dining/add?${params.toString()}`);
  };

  if (loading || dismissed || unrecordedVisits.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-lg border border-accent/30 bg-accent/5 p-4 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Star className="h-4 w-4 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium mb-2">
              {language === "pt" 
                ? "Como foi sua experiência?" 
                : "How was your experience?"}
            </p>
            <div className="space-y-2">
              {unrecordedVisits.map((visit) => (
                <button
                  key={visit.id}
                  onClick={() => handleRecordExperience(visit)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group w-full text-left"
                >
                  <span className="font-medium text-foreground group-hover:text-accent transition-colors">
                    {visit.restaurant_name}
                  </span>
                  <span className="text-xs">
                    • {format(new Date(visit.start_datetime), "MMM d")}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}