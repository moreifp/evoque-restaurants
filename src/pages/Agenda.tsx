import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Sparkles, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";
import { ScheduledVisitCard } from "@/components/agenda/ScheduledVisitCard";
import { AddReservationModal } from "@/components/agenda/AddReservationModal";
import { AgendaAIPlannerTab } from "@/components/agenda/AgendaAIPlannerTab";
import { Card, CardContent } from "@/components/ui/card";

interface ScheduledVisit {
  id: string;
  user_id: string;
  restaurant_name: string;
  google_place_id: string | null;
  location_address: string | null;
  phone: string | null;
  website: string | null;
  maps_url: string | null;
  city: string;
  start_datetime: string;
  end_datetime: string;
  meal_type: string;
  status: string;
  party_size: number | null;
  booking_ref: string | null;
  notes: string | null;
  source: string;
  ai_plan_id: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export default function Agenda() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();
  const [upcomingVisits, setUpcomingVisits] = useState<ScheduledVisit[]>([]);
  const [pastVisits, setPastVisits] = useState<ScheduledVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<ScheduledVisit | null>(null);
  
  const defaultTab = searchParams.get("tab") || "upcoming";

  useEffect(() => {
    fetchVisits();
  }, []);

  const fetchVisits = async () => {
    setLoading(true);
    const now = new Date().toISOString();
    
    // Fetch upcoming visits
    const { data: upcoming } = await supabase
      .from("scheduled_visits")
      .select("*")
      .gte("start_datetime", now)
      .neq("status", "canceled")
      .order("start_datetime", { ascending: true });

    // Fetch past visits
    const { data: past } = await supabase
      .from("scheduled_visits")
      .select("*")
      .or(`start_datetime.lt.${now},status.eq.completed`)
      .order("start_datetime", { ascending: false });

    if (upcoming) setUpcomingVisits(upcoming as ScheduledVisit[]);
    if (past) setPastVisits(past as ScheduledVisit[]);
    setLoading(false);
  };

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const handleAddReservation = () => {
    setEditingVisit(null);
    setIsModalOpen(true);
  };

  const handleEditVisit = (visit: ScheduledVisit) => {
    setEditingVisit(visit);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingVisit(null);
  };

  const handleSave = () => {
    handleModalClose();
    fetchVisits();
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div className="mb-4 md:mb-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-accent" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">{t("agenda.title")}</h1>
            </div>
            <p className="text-muted-foreground text-lg">{t("agenda.subtitle")}</p>
          </div>
          
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => handleTabChange("aiPlan")}>
              <Sparkles className="h-4 w-4 mr-2" />
              {t("agenda.planWithAI")}
            </Button>
            <Button onClick={handleAddReservation}>
              <Plus className="h-4 w-4 mr-2" />
              {t("agenda.addReservation")}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={defaultTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6">
            <TabsTrigger value="upcoming">{t("agenda.tabs.upcoming")}</TabsTrigger>
            <TabsTrigger value="aiPlan">{t("agenda.tabs.aiPlan")}</TabsTrigger>
            <TabsTrigger value="past">{t("agenda.tabs.past")}</TabsTrigger>
          </TabsList>

          {/* Upcoming Tab */}
          <TabsContent value="upcoming">
            {loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">{t("common.loading")}</p>
              </div>
            ) : upcomingVisits.length > 0 ? (
              <div className="space-y-4">
                {upcomingVisits.map((visit) => (
                  <ScheduledVisitCard
                    key={visit.id}
                    visit={visit}
                    onEdit={() => handleEditVisit(visit)}
                    onRefresh={fetchVisits}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">{t("agenda.noUpcoming")}</h3>
                <p className="text-muted-foreground mb-6">{t("agenda.noUpcomingDesc")}</p>
                <div className="flex justify-center gap-3">
                  <Button onClick={handleAddReservation}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("agenda.addReservation")}
                  </Button>
                  <Button variant="outline" onClick={() => handleTabChange("aiPlan")}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t("agenda.planWithAI")}
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* AI Planner Tab */}
          <TabsContent value="aiPlan">
            <AgendaAIPlannerTab onVisitsCreated={fetchVisits} />
          </TabsContent>

          {/* Past Tab */}
          <TabsContent value="past">
            {loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">{t("common.loading")}</p>
              </div>
            ) : pastVisits.length > 0 ? (
              <div className="space-y-4">
                {pastVisits.map((visit) => (
                  <ScheduledVisitCard
                    key={visit.id}
                    visit={visit}
                    onEdit={() => handleEditVisit(visit)}
                    onRefresh={fetchVisits}
                    isPast
                  />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">{t("agenda.noPast")}</h3>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Add/Edit Reservation Modal */}
      <AddReservationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleSave}
        editingVisit={editingVisit}
      />
    </div>
  );
}