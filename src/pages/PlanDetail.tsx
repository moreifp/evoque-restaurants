import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Edit, Plus } from "lucide-react";
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
}

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<any>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("");

  useEffect(() => {
    const fetchPlan = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error) setPlan(data);
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

  const handleAddToDiningList = (restaurantName: string, googlePlaceId?: string) => {
    const params = new URLSearchParams({
      name: restaurantName,
      ...(googlePlaceId && { google_place_id: googlePlaceId }),
    });
    navigate(`/add?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">AI Plan</h1>
            <p className="text-muted-foreground">
              {plan?.city ? `City: ${plan.city}` : 'Loading...'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/planner')}>New Plan</Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading plan...</div>
        ) : !plan ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">Plan not found.</p>
            <Button onClick={() => navigate('/planner')}>Create a Plan</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Intake Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Price</div>
                  <div className="font-medium">{plan?.intake_json?.price ?? '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Cuisines</div>
                  <div className="flex flex-wrap gap-2">
                    {(plan?.intake_json?.cuisines ?? []).map((c: string) => (
                      <Badge key={c} variant="secondary">{c}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Vibe</div>
                  <div className="flex flex-wrap gap-2">
                    {(plan?.intake_json?.vibe ?? []).map((v: string) => (
                      <Badge key={v} variant="secondary">{v}</Badge>
                    ))}
                  </div>
                </div>
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
                <CardHeader>
                  <CardTitle>Proposed Schedule</CardTitle>
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
                            </div>
                            <div className="flex items-center gap-2">
                              {s.reservation_required && (
                                <Badge variant="secondary">Reservation</Badge>
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
                                onClick={() => handleAddToDiningList(s.restaurant, rec?.google_place_id)}
                              >
                                <Plus className="h-4 w-4" />
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
    </div>
  );
}
