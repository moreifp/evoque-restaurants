import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ChevronRight, Plus, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";

interface ScheduledVisit {
  id: string;
  restaurant_name: string;
  city: string;
  start_datetime: string;
  meal_type: string;
}

export function UpcomingReservationsSection() {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [visits, setVisits] = useState<ScheduledVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const mealTypeLabels: Record<string, string> = {
    breakfast: t("agenda.mealTypes.breakfast"),
    lunch: t("agenda.mealTypes.lunch"),
    dinner: t("agenda.mealTypes.dinner"),
    drinks: t("agenda.mealTypes.drinks"),
    other: t("agenda.mealTypes.other"),
  };

  useEffect(() => {
    fetchUpcoming();
  }, []);

  const fetchUpcoming = async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("scheduled_visits")
      .select("id, restaurant_name, city, start_datetime, meal_type")
      .gte("start_datetime", now)
      .neq("status", "canceled")
      .order("start_datetime", { ascending: true })
      .limit(3);

    if (data) setVisits(data as ScheduledVisit[]);
    setLoading(false);
  };

  if (loading) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{t("home.upcomingReservations")}</h2>
        {visits.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => navigate("/agenda")}>
            {t("common.all")}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>

      {visits.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {visits.map((visit) => (
            <Card
              key={visit.id}
              className="group hover:shadow-large transition-all cursor-pointer"
              onClick={() => navigate("/agenda")}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold group-hover:text-accent transition-colors line-clamp-1">
                    {visit.restaurant_name}
                  </h3>
                  <span className="text-xs px-2 py-0.5 bg-secondary rounded">
                    {mealTypeLabels[visit.meal_type]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {format(new Date(visit.start_datetime), "MMM d", {
                      locale: language === "pt" ? undefined : undefined,
                    })}
                  </span>
                  <MapPin className="h-3.5 w-3.5 ml-2" />
                  <span className="line-clamp-1">{visit.city}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center bg-muted/30">
          <p className="text-muted-foreground mb-4">{t("home.noUpcomingReservations")}</p>
          <div className="flex justify-center gap-3">
            <Button size="sm" onClick={() => navigate("/agenda")}>
              <Plus className="h-4 w-4 mr-1" />
              {t("agenda.addReservation")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/agenda?tab=aiPlan")}>
              <Sparkles className="h-4 w-4 mr-1" />
              {t("agenda.planWithAI")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}