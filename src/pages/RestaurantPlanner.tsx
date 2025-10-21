import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, MapPin, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function RestaurantPlanner() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [language, setLanguage] = useState<'pt-BR' | 'en-US'>('en-US');

  const handleStartPlanning = async () => {
    if (!city.trim()) {
      toast({
        title: language === 'pt-BR' ? "Cidade necessária" : "City required",
        description: language === 'pt-BR' 
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
        title: language === 'pt-BR' ? "Planejando sua viagem..." : "Planning your trip...",
        description: language === 'pt-BR' 
          ? "Nossa IA está criando recomendações personalizadas"
          : "Our AI is creating personalized recommendations",
      });

      const { data, error } = await supabase.functions.invoke('restaurant-planner', {
        body: {
          action: 'start_planning',
          data: {
            city,
            startDate: startDate ? format(startDate, 'yyyy-MM-dd') : null,
            endDate: endDate ? format(endDate, 'yyyy-MM-dd') : null,
            language,
          },
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      // Save plan to database
      const { data: planData, error: planError } = await supabase
        .from('plans')
        .insert({
          user_id: user.id,
          city,
          start_date: startDate ? format(startDate, 'yyyy-MM-dd') : null,
          end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
          intake_json: data.result?.intake_summary,
          recommendations_json: data.result?.recommendations,
          schedule_json: data.result?.proposed_schedule,
          status: 'draft',
        })
        .select()
        .single();

      if (planError) throw planError;

      toast({
        title: language === 'pt-BR' ? "Plano criado!" : "Plan created!",
        description: language === 'pt-BR' 
          ? `Encontramos ${data.result?.recommendations?.length || 0} restaurantes para você`
          : `Found ${data.result?.recommendations?.length || 0} restaurants for you`,
      });

      navigate(`/plans/${planData.id}`);
    } catch (error: any) {
      console.error('Error planning:', error);
      toast({
        title: language === 'pt-BR' ? "Erro" : "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mb-4">
              <Sparkles className="h-8 w-8 text-accent" />
            </div>
            <h1 className="text-4xl font-bold mb-2">
              {language === 'pt-BR' ? 'Planejador de Restaurantes' : 'Restaurant Planner'}
            </h1>
            <p className="text-muted-foreground text-lg">
              {language === 'pt-BR' 
                ? 'Deixe a IA planejar suas experiências gastronômicas'
                : 'Let AI plan your dining experiences'}
            </p>
          </div>

          {/* Language Toggle */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex rounded-lg border border-border p-1">
              <Button
                variant={language === 'en-US' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLanguage('en-US')}
              >
                English
              </Button>
              <Button
                variant={language === 'pt-BR' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLanguage('pt-BR')}
              >
                Português
              </Button>
            </div>
          </div>

          {/* Planning Form */}
          <Card>
            <CardHeader>
              <CardTitle>
                {language === 'pt-BR' ? 'Detalhes da Viagem' : 'Trip Details'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* City */}
              <div className="space-y-2">
                <Label htmlFor="city">
                  {language === 'pt-BR' ? 'Cidade *' : 'City *'}
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="city"
                    type="text"
                    placeholder={language === 'pt-BR' ? 'Paris, Londres, Nova York...' : 'Paris, London, New York...'}
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
                    {language === 'pt-BR' ? 'Data de Início' : 'Start Date'}
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
                          <span>{language === 'pt-BR' ? 'Escolha uma data' : 'Pick a date'}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>
                    {language === 'pt-BR' ? 'Data de Término' : 'End Date'}
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
                          <span>{language === 'pt-BR' ? 'Escolha uma data' : 'Pick a date'}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                        disabled={(date) =>
                          startDate ? date < startDate : false
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>
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
                  ? (language === 'pt-BR' ? 'Planejando...' : 'Planning...') 
                  : (language === 'pt-BR' ? 'Planejar Restaurantes' : 'Plan Restaurants')}
              </Button>
            </CardContent>
          </Card>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-accent mb-2">8-12</div>
                <p className="text-sm text-muted-foreground">
                  {language === 'pt-BR' ? 'Restaurantes sugeridos' : 'Restaurant suggestions'}
                </p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-accent mb-2">AI</div>
                <p className="text-sm text-muted-foreground">
                  {language === 'pt-BR' ? 'Baseado no seu gosto' : 'Based on your taste'}
                </p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-accent mb-2">5-7</div>
                <p className="text-sm text-muted-foreground">
                  {language === 'pt-BR' ? 'Dias de refeições' : 'Days of meals'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
