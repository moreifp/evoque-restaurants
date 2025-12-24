import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, MapPin, Sparkles, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface AgendaAIPlannerTabProps {
  onVisitsCreated: () => void;
}

interface ExistingVisit {
  id: string;
  restaurant_name: string;
  start_datetime: string;
  meal_type: string;
  city: string;
}

export function AgendaAIPlannerTab({ onVisitsCreated }: AgendaAIPlannerTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [loading, setLoading] = useState(false);
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [instructions, setInstructions] = useState("");
  const [existingVisits, setExistingVisits] = useState<ExistingVisit[]>([]);

  // Fetch existing visits when city and dates change
  useEffect(() => {
    if (city && startDate && endDate) {
      fetchExistingVisits();
    } else {
      setExistingVisits([]);
    }
  }, [city, startDate, endDate]);

  const fetchExistingVisits = async () => {
    if (!startDate || !endDate) return;

    const { data } = await supabase
      .from("scheduled_visits")
      .select("id, restaurant_name, start_datetime, meal_type, city")
      .ilike("city", `%${city}%`)
      .gte("start_datetime", startDate.toISOString())
      .lte("start_datetime", endDate.toISOString())
      .neq("status", "canceled");

    if (data) {
      setExistingVisits(data as ExistingVisit[]);
    }
  };

  const mealTypeLabels: Record<string, string> = {
    breakfast: t("agenda.mealTypes.breakfast"),
    lunch: t("agenda.mealTypes.lunch"),
    dinner: t("agenda.mealTypes.dinner"),
    drinks: t("agenda.mealTypes.drinks"),
    other: t("agenda.mealTypes.other"),
  };

  const handleStartPlanning = async () => {
    if (!city.trim()) {
      toast({
        title: language === "pt" ? "Cidade necessária" : "City required",
        description: language === "pt"
          ? "Por favor, insira uma cidade para começar o planejamento"
          : "Please enter a city to start planning",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      toast({
        title: language === "pt" ? "Planejando sua viagem..." : "Planning your trip...",
        description: language === "pt"
          ? "Nossa IA está criando recomendações personalizadas"
          : "Our AI is creating personalized recommendations",
      });

      // Build context about existing reservations
      const existingReservationsContext = existingVisits.length > 0
        ? `The user already has these reservations: ${existingVisits.map(v => 
            `${v.restaurant_name} on ${format(new Date(v.start_datetime), "PPP")} for ${v.meal_type}`
          ).join(", ")}. Avoid scheduling conflicts and don't suggest these restaurants again.`
        : "";

      const fullInstructions = [instructions, existingReservationsContext]
        .filter(Boolean)
        .join("\n\n");

      const { data, error } = await supabase.functions.invoke("restaurant-planner", {
        body: {
          action: "start_planning",
          data: {
            city,
            startDate: startDate ? format(startDate, "yyyy-MM-dd") : null,
            endDate: endDate ? format(endDate, "yyyy-MM-dd") : null,
            language: language === "pt" ? "pt-BR" : "en-US",
            instructions: fullInstructions || undefined,
          },
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      // Save plan to database with instructions
      const { data: planData, error: planError } = await supabase
        .from("plans")
        .insert({
          user_id: user.id,
          city,
          start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
          end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
          intake_json: data.result?.intake_summary,
          recommendations_json: data.result?.recommendations,
          schedule_json: data.result?.proposed_schedule,
          instructions: instructions || null,
          status: "draft",
        })
        .select()
        .single();

      if (planError) throw planError;

      // Save proposed schedule items as scheduled_visits
      if (data.result?.proposed_schedule?.length > 0) {
        const scheduledVisits = data.result.proposed_schedule.map((slot: any) => ({
          user_id: user.id,
          restaurant_name: slot.restaurant_name || slot.restaurant || "TBD",
          city,
          start_datetime: slot.datetime || new Date().toISOString(),
          end_datetime: slot.end_datetime || new Date(new Date(slot.datetime).getTime() + 90 * 60000).toISOString(),
          meal_type: slot.meal_type || "dinner",
          status: "planned",
          source: "ai",
          ai_plan_id: planData.id,
          notes: slot.notes || null,
        }));

        await supabase.from("scheduled_visits").insert(scheduledVisits);
        onVisitsCreated();
      }

      toast({
        title: language === "pt" ? "Plano criado!" : "Plan created!",
        description: language === "pt"
          ? `Encontramos ${data.result?.recommendations?.length || 0} restaurantes para você`
          : `Found ${data.result?.recommendations?.length || 0} restaurants for you`,
      });

      navigate(`/plans/${planData.id}`);
    } catch (error: any) {
      console.error("Error planning:", error);
      toast({
        title: language === "pt" ? "Erro" : "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            {language === "pt" ? "Detalhes da Viagem" : "Trip Details"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* City */}
          <div className="space-y-2">
            <Label htmlFor="city">
              {language === "pt" ? "Cidade *" : "City *"}
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="city"
                type="text"
                placeholder={language === "pt" ? "Paris, Londres, Nova York..." : "Paris, London, New York..."}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                {language === "pt" ? "Data de Início" : "Start Date"}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? (
                      format(startDate, "PPP")
                    ) : (
                      <span>{language === "pt" ? "Escolha uma data" : "Pick a date"}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>
                {language === "pt" ? "Data de Término" : "End Date"}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? (
                      format(endDate, "PPP")
                    ) : (
                      <span>{language === "pt" ? "Escolha uma data" : "Pick a date"}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    disabled={(date) => (startDate ? date < startDate : false)}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Existing Reservations Warning */}
          {existingVisits.length > 0 && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                    {t("agenda.existingReservations")}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                    {t("agenda.existingReservationsDesc")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {existingVisits.map((visit) => (
                      <Badge key={visit.id} variant="outline" className="text-xs">
                        {visit.restaurant_name} • {format(new Date(visit.start_datetime), "MMM d")} • {mealTypeLabels[visit.meal_type]}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="space-y-2">
            <Label htmlFor="instructions">
              {t("agenda.instructions")}
            </Label>
            <Textarea
              id="instructions"
              placeholder={t("agenda.instructionsPlaceholder")}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleStartPlanning}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-5 w-5 mr-2" />
            {loading
              ? (language === "pt" ? "Planejando..." : "Planning...")
              : (language === "pt" ? "Planejar Restaurantes" : "Plan Restaurants")}
          </Button>
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-accent mb-2">8-12</div>
            <p className="text-sm text-muted-foreground">
              {language === "pt" ? "Restaurantes sugeridos" : "Restaurant suggestions"}
            </p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-accent mb-2">AI</div>
            <p className="text-sm text-muted-foreground">
              {language === "pt" ? "Baseado no seu gosto" : "Based on your taste"}
            </p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-accent mb-2">5-7</div>
            <p className="text-sm text-muted-foreground">
              {language === "pt" ? "Dias de refeições" : "Days of meals"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}