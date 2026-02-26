import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Edit, CalendarPlus, Sparkles, X, Check, Globe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAIConsent } from "@/hooks/useAIConsent";

interface Recommendation {
  bucket: string;
  name: string;
  cuisine?: string;
  vibe?: string[];
  price?: string;
  highlight?: string;
  why_fit?: string;
  reservation_likely?: boolean;
  google_place_id?: string;
  area_hint?: string;
}

interface ScheduleItem {
  day: string;
  meal: string;
  restaurant: string;
  reservation_required?: boolean;
  notes?: string;
  has_reservation?: boolean;
  reservation_people?: number;
}

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ensureAIConsent } = useAIConsent();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<any>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("");
  const [editingIntake, setEditingIntake] = useState(false);
  const [refining, setRefining] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [editingReservation, setEditingReservation] = useState<number | null>(null);
  const [reservationForm, setReservationForm] = useState({
    has_reservation: false,
    reservation_people: 2,
  });
  const [intakeForm, setIntakeForm] = useState({
    price: "",
    cuisines: [] as string[],
    vibe: [] as string[],
    must_try: [] as string[],
    constraints: [] as string[],
    additional_notes: "",
  });

  useEffect(() => {
    const fetchPlan = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        setPlan(data);
        // Initialize intake form
        const intake: any = data.intake_json || {};
        setIntakeForm({
          price: intake.price || "",
          cuisines: intake.cuisines || [],
          vibe: intake.vibe || [],
          must_try: intake.must_try || [],
          constraints: intake.constraints || [],
          additional_notes: intake.additional_notes || "",
        });
      }
      setLoading(false);
    };
    if (id) fetchPlan();
  }, [id]);

  const recs = (plan?.recommendations_json || []) as Recommendation[];
  const schedule = (plan?.schedule_json || []) as ScheduleItem[];

  const handleEditSlot = (idx: number) => {
    setEditingSlot(idx);
    setSelectedRestaurant(schedule[idx].restaurant);
  };

  const handleSaveSlot = async () => {
    if (editingSlot === null) return;
    
    const updatedSchedule = [...schedule];
    const selectedRec = recs.find(r => r.name === selectedRestaurant);
    updatedSchedule[editingSlot] = {
      ...updatedSchedule[editingSlot],
      restaurant: selectedRestaurant,
      reservation_required: selectedRec?.reservation_likely || false,
    };

    const { error } = await supabase
      .from('plans')
      .update({ schedule_json: updatedSchedule as any })
      .eq('id', id);

    if (error) {
      toast.error("Failed to update schedule");
    } else {
      setPlan({ ...plan, schedule_json: updatedSchedule });
      toast.success("Schedule updated");
      setEditingSlot(null);
    }
  };

  const handleAddToAgenda = async (slot: ScheduleItem) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Faça login para adicionar reservas");
        return;
      }

      // Get timezone from plan intake_json (default to UTC)
      const planTimezone = plan?.intake_json?.timezone || 'UTC';

      // Parse the day to get a proper date
      let scheduledDate: Date;
      const dayStr = slot.day;
      
      // Check if it's a date format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}/.test(dayStr)) {
        // Parse date parts to avoid timezone issues
        const [year, month, day] = dayStr.split('-').map(Number);
        scheduledDate = new Date(year, month - 1, day);
      } else if (plan?.start_date) {
        // Use plan start date as base for relative days (D1, D2, etc.)
        const dayMatch = dayStr.match(/D(\d+)/i);
        if (dayMatch) {
          const dayOffset = parseInt(dayMatch[1]) - 1;
          const [year, month, day] = plan.start_date.split('-').map(Number);
          scheduledDate = new Date(year, month - 1, day);
          scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
        } else {
          scheduledDate = new Date();
        }
      } else {
        scheduledDate = new Date();
      }

      // Detect meal type - normalize string for comparison (remove accents and lowercase)
      const mealNormalized = slot.meal.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const isLunch = mealNormalized.includes('almoco') || mealNormalized.includes('lunch');
      
      // Set meal time
      const mealHour = isLunch ? 12 : 19;
      scheduledDate.setHours(mealHour, 30, 0, 0);

      const endDate = new Date(scheduledDate.getTime() + 90 * 60000); // 1.5 hours later

      const rec = recs.find(r => r.name === slot.restaurant);

      // Enrich restaurant data with Google Places API
      let enrichedData = {
        google_place_id: rec?.google_place_id || null,
        location_address: null as string | null,
        phone: null as string | null,
        website: null as string | null,
        maps_url: null as string | null,
      };

      try {
        const { data: enrichResult, error: enrichError } = await supabase.functions.invoke('enrich-restaurant-data', {
          body: {
            restaurant_name: slot.restaurant,
            city: plan.city,
            google_place_id: rec?.google_place_id,
          }
        });

        if (!enrichError && enrichResult?.success && enrichResult?.data) {
          enrichedData = enrichResult.data;
          console.log('Enriched restaurant data:', enrichedData);
        } else {
          console.warn('Could not enrich restaurant data:', enrichError || enrichResult?.error);
        }
      } catch (enrichErr) {
        console.warn('Error enriching restaurant data:', enrichErr);
      }

      const { error } = await supabase.from('scheduled_visits').insert({
        user_id: user.id,
        restaurant_name: slot.restaurant,
        city: plan.city,
        start_datetime: scheduledDate.toISOString(),
        end_datetime: endDate.toISOString(),
        meal_type: isLunch ? 'lunch' : 'dinner',
        status: slot.has_reservation ? 'booked' : 'planned',
        source: 'ai',
        ai_plan_id: plan.id,
        notes: slot.notes || null,
        google_place_id: enrichedData.google_place_id,
        location_address: enrichedData.location_address,
        phone: enrichedData.phone,
        website: enrichedData.website,
        maps_url: enrichedData.maps_url,
        party_size: slot.reservation_people || null,
        timezone: planTimezone,
      });

      if (error) throw error;

      toast.success(`${slot.restaurant} adicionado às reservas!`);
    } catch (error: any) {
      console.error('Error adding to agenda:', error);
      toast.error("Erro ao adicionar à agenda");
    }
  };

  const handleApproveAllSchedule = async () => {
    if (schedule.length === 0) {
      toast.error("Nenhum item no cronograma");
      return;
    }

    setApprovingAll(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Faça login para adicionar reservas");
        return;
      }

      // Get timezone from plan intake_json (default to UTC)
      const planTimezone = plan?.intake_json?.timezone || 'UTC';

      // Enrich all restaurants in parallel
      const enrichmentPromises = schedule.map(async (slot) => {
        const rec = recs.find(r => r.name === slot.restaurant);
        try {
          const { data: enrichResult, error: enrichError } = await supabase.functions.invoke('enrich-restaurant-data', {
            body: {
              restaurant_name: slot.restaurant,
              city: plan.city,
              google_place_id: rec?.google_place_id,
            }
          });

          if (!enrichError && enrichResult?.success && enrichResult?.data) {
            return enrichResult.data;
          }
        } catch (err) {
          console.warn(`Error enriching ${slot.restaurant}:`, err);
        }
        return {
          google_place_id: rec?.google_place_id || null,
          location_address: null,
          phone: null,
          website: null,
          maps_url: null,
        };
      });

      const enrichedDataArray = await Promise.all(enrichmentPromises);

      const scheduledVisits = schedule.map((slot, index) => {
        // Parse the day to get a proper date
        let scheduledDate: Date;
        const dayStr = slot.day;
        
        if (/^\d{4}-\d{2}-\d{2}/.test(dayStr)) {
          // Parse date parts to avoid timezone issues
          const [year, month, day] = dayStr.split('-').map(Number);
          scheduledDate = new Date(year, month - 1, day);
        } else if (plan?.start_date) {
          const dayMatch = dayStr.match(/D(\d+)/i);
          if (dayMatch) {
            const dayOffset = parseInt(dayMatch[1]) - 1;
            const [year, month, day] = plan.start_date.split('-').map(Number);
            scheduledDate = new Date(year, month - 1, day);
            scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
          } else {
            scheduledDate = new Date();
          }
        } else {
          scheduledDate = new Date();
        }

        // Detect meal type - normalize string for comparison (remove accents and lowercase)
        const mealNormalized = slot.meal.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const isLunch = mealNormalized.includes('almoco') || mealNormalized.includes('lunch');
        
        const mealHour = isLunch ? 12 : 19;
        scheduledDate.setHours(mealHour, 30, 0, 0);

        const endDate = new Date(scheduledDate.getTime() + 90 * 60000);
        const enrichedData = enrichedDataArray[index];

        return {
          user_id: user.id,
          restaurant_name: slot.restaurant,
          city: plan.city,
          start_datetime: scheduledDate.toISOString(),
          end_datetime: endDate.toISOString(),
          meal_type: isLunch ? 'lunch' : 'dinner',
          status: slot.has_reservation ? 'booked' : 'planned',
          source: 'ai',
          ai_plan_id: plan.id,
          notes: slot.notes || null,
          google_place_id: enrichedData.google_place_id,
          location_address: enrichedData.location_address,
          phone: enrichedData.phone,
          website: enrichedData.website,
          maps_url: enrichedData.maps_url,
          party_size: slot.reservation_people || null,
          timezone: planTimezone,
        };
      });

      const { error } = await supabase.from('scheduled_visits').insert(scheduledVisits);

      if (error) throw error;

      toast.success(`${schedule.length} reservas adicionadas à agenda!`);
      navigate('/agenda');
    } catch (error: any) {
      console.error('Error approving all:', error);
      toast.error("Erro ao adicionar reservas");
    } finally {
      setApprovingAll(false);
    }
  };

  const handleRefineRecommendations = async () => {
    const allowed = await ensureAIConsent("recommendations");
    if (!allowed) return;
    setRefining(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke('restaurant-planner', {
        body: {
          action: 'refine',
          data: {
            city: plan.city,
            intake: intakeForm,
            existing_recommendations: recs,
          }
        }
      });

      if (error) throw error;

      // The edge function returns { result: { recommendations: [...] } }
      const recommendations = data?.result?.recommendations || data?.recommendations;
      
      if (!recommendations || recommendations.length === 0) {
        throw new Error("No recommendations returned");
      }

      const { error: updateError } = await supabase
        .from('plans')
        .update({ 
          recommendations_json: recommendations as any,
          intake_json: intakeForm as any
        })
        .eq('id', id);

      if (updateError) throw updateError;

      setPlan({ 
        ...plan, 
        recommendations_json: recommendations,
        intake_json: intakeForm 
      });
      toast.success("New recommendations generated");
      setEditingIntake(false);
    } catch (error: any) {
      console.error('Error refining recommendations:', error);
      toast.error(error.message || "Failed to generate new recommendations");
    } finally {
      setRefining(false);
    }
  };

  const addTag = (field: 'cuisines' | 'vibe' | 'must_try' | 'constraints', value: string) => {
    if (!value.trim()) return;
    setIntakeForm(prev => ({
      ...prev,
      [field]: [...prev[field], value.trim()]
    }));
  };

  const removeTag = (field: 'cuisines' | 'vibe' | 'must_try' | 'constraints', index: number) => {
    setIntakeForm(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  const handleOpenReservation = (idx: number) => {
    const slot = schedule[idx];
    setReservationForm({
      has_reservation: slot.has_reservation || false,
      reservation_people: slot.reservation_people || 2,
    });
    setEditingReservation(idx);
  };

  const handleSaveReservation = async () => {
    if (editingReservation === null) return;
    
    const updatedSchedule = [...schedule];
    updatedSchedule[editingReservation] = {
      ...updatedSchedule[editingReservation],
      has_reservation: reservationForm.has_reservation,
      reservation_people: reservationForm.has_reservation ? reservationForm.reservation_people : undefined,
    };

    const { error } = await supabase
      .from('plans')
      .update({ schedule_json: updatedSchedule as any })
      .eq('id', id);

    if (error) {
      toast.error("Failed to update reservation");
    } else {
      setPlan({ ...plan, schedule_json: updatedSchedule });
      toast.success("Reservation updated");
      setEditingReservation(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">AI Plan</h1>
            <p className="text-muted-foreground">
              {plan?.city ? `City: ${plan.city}` : 'Loading...'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/agenda?tab=aiPlan')}>New Plan</Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading plan...</div>
        ) : !plan ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">Plan not found.</p>
            <Button onClick={() => navigate('/agenda?tab=aiPlan')}>Create a Plan</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Intake Summary</CardTitle>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => setEditingIntake(true)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Price</div>
                  <div className="font-medium">{plan?.intake_json?.price || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Cuisines</div>
                  <div className="flex flex-wrap gap-2">
                    {(plan?.intake_json?.cuisines ?? []).map((c: string, i: number) => (
                      <Badge key={i} variant="secondary">{c}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Vibe</div>
                  <div className="flex flex-wrap gap-2">
                    {(plan?.intake_json?.vibe ?? []).map((v: string, i: number) => (
                      <Badge key={i} variant="secondary">{v}</Badge>
                    ))}
                  </div>
                </div>
                {(plan?.intake_json?.must_try?.length > 0) && (
                  <div>
                    <div className="text-sm text-muted-foreground">Must Try</div>
                    <div className="flex flex-wrap gap-2">
                      {plan.intake_json.must_try.map((m: string, i: number) => (
                        <Badge key={i} variant="outline">{m}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(plan?.intake_json?.constraints?.length > 0) && (
                  <div>
                    <div className="text-sm text-muted-foreground">Constraints</div>
                    <div className="flex flex-wrap gap-2">
                      {plan.intake_json.constraints.map((c: string, i: number) => (
                        <Badge key={i} variant="outline">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {plan?.intake_json?.timezone && (
                  <div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      Timezone
                    </div>
                    <div className="font-medium text-sm">
                      {plan.intake_json.timezone.replace('_', ' ').replace('/', ' / ')}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recommendations ({recs.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recs.length === 0 ? (
                    <p className="text-muted-foreground">No recommendations.</p>
                  ) : (
                    <div className="space-y-4">
                      {recs.map((r, idx) => (
                        <div key={idx} className="p-4 border border-border rounded-lg">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-lg font-semibold">{r.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {r.cuisine || ''} {r.price ? `• ${r.price}` : ''}
                              </div>
                              {r.highlight && (
                                <div className="text-sm mt-2">{r.highlight}</div>
                              )}
                              {r.why_fit && (
                                <div className="text-xs text-muted-foreground mt-1">{r.why_fit}</div>
                              )}
                            </div>
                            <div className="text-right">
                              <Badge variant="outline">{r.bucket}</Badge>
                              {r.reservation_likely ? (
                                <div className="text-xs text-accent mt-2">Reservation likely</div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Proposed Schedule</CardTitle>
                  {schedule.length > 0 && (
                    <Button 
                      onClick={handleApproveAllSchedule}
                      disabled={approvingAll}
                      className="gap-2"
                    >
                      <Check className="h-4 w-4" />
                      {approvingAll ? "Salvando..." : "Aprovar Tudo"}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {schedule.length === 0 ? (
                    <p className="text-muted-foreground">No schedule yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {schedule.map((s, idx) => {
                        const rec = recs.find(r => r.name === s.restaurant);
                        return (
                          <div key={idx} className="flex items-start justify-between p-3 border border-border rounded-lg gap-3">
                            <div className="flex-1">
                              <div className="font-medium">{s.day} • {s.meal}</div>
                              <div className="text-sm">{s.restaurant}</div>
                              {s.notes && <div className="text-xs text-muted-foreground mt-1">{s.notes}</div>}
                              {s.has_reservation && (
                                <div className="text-xs text-primary mt-1">
                                  ✓ Reservation made for {s.reservation_people} {s.reservation_people === 1 ? 'person' : 'people'}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {s.has_reservation ? (
                                <Badge 
                                  variant="default"
                                  className="cursor-pointer"
                                  onClick={() => handleOpenReservation(idx)}
                                >
                                  Reserved ({s.reservation_people})
                                </Badge>
                              ) : (
                                <Badge 
                                  variant={s.reservation_required ? "outline" : "secondary"}
                                  className="cursor-pointer"
                                  onClick={() => handleOpenReservation(idx)}
                                >
                                  {s.reservation_required ? "Reservation recommended" : "Add reservation"}
                                </Badge>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditSlot(idx)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAddToAgenda(s)}
                                title="Adicionar às reservas"
                              >
                                <CalendarPlus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      <Dialog open={editingSlot !== null} onOpenChange={() => setEditingSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Restaurant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
              <SelectTrigger>
                <SelectValue placeholder="Select a restaurant" />
              </SelectTrigger>
              <SelectContent>
                {recs.map((r, idx) => (
                  <SelectItem key={idx} value={r.name}>
                    {r.name} - {r.cuisine} ({r.price})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingSlot(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSlot}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingIntake} onOpenChange={setEditingIntake}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Search Parameters</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Price Level</Label>
              <Select value={intakeForm.price} onValueChange={(v) => setIntakeForm({...intakeForm, price: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select price level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="€">€ - Budget</SelectItem>
                  <SelectItem value="€€">€€ - Moderate</SelectItem>
                  <SelectItem value="€€€">€€€ - Upscale</SelectItem>
                  <SelectItem value="€€€€">€€€€ - Fine Dining</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Cuisines</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {intakeForm.cuisines.map((c, i) => (
                  <Badge key={i} variant="secondary">
                    {c}
                    <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => removeTag('cuisines', i)} />
                  </Badge>
                ))}
              </div>
              <Input 
                placeholder="Add cuisine (press Enter)" 
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag('cuisines', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>

            <div>
              <Label>Vibe</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {intakeForm.vibe.map((v, i) => (
                  <Badge key={i} variant="secondary">
                    {v}
                    <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => removeTag('vibe', i)} />
                  </Badge>
                ))}
              </div>
              <Input 
                placeholder="Add vibe (press Enter)" 
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag('vibe', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>

            <div>
              <Label>Must Try Dishes</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {intakeForm.must_try.map((m, i) => (
                  <Badge key={i} variant="outline">
                    {m}
                    <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => removeTag('must_try', i)} />
                  </Badge>
                ))}
              </div>
              <Input 
                placeholder="Add dish (press Enter)" 
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag('must_try', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>

            <div>
              <Label>Dietary Constraints</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {intakeForm.constraints.map((c, i) => (
                  <Badge key={i} variant="outline">
                    {c}
                    <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => removeTag('constraints', i)} />
                  </Badge>
                ))}
              </div>
              <Input 
                placeholder="Add constraint (press Enter)" 
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag('constraints', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>

            <div>
              <Label>Additional Notes</Label>
              <Textarea 
                placeholder="Any other preferences or requirements..."
                value={intakeForm.additional_notes}
                onChange={(e) => setIntakeForm({...intakeForm, additional_notes: e.target.value})}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingIntake(false)}>
                Cancel
              </Button>
              <Button onClick={handleRefineRecommendations} disabled={refining}>
                <Sparkles className="h-4 w-4 mr-2" />
                {refining ? "Generating..." : "Generate New Recommendations"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingReservation !== null} onOpenChange={() => setEditingReservation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reservation Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="has_reservation"
                checked={reservationForm.has_reservation}
                onChange={(e) => setReservationForm({...reservationForm, has_reservation: e.target.checked})}
                className="h-4 w-4"
              />
              <Label htmlFor="has_reservation" className="cursor-pointer">
                I have made a reservation
              </Label>
            </div>
            
            {reservationForm.has_reservation && (
              <div>
                <Label htmlFor="people">Number of People</Label>
                <Input
                  id="people"
                  type="number"
                  min="1"
                  max="20"
                  value={reservationForm.reservation_people}
                  onChange={(e) => setReservationForm({...reservationForm, reservation_people: parseInt(e.target.value) || 2})}
                  className="mt-2"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingReservation(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveReservation}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
