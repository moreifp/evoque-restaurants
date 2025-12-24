import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  MapPin, 
  Phone, 
  Edit, 
  Star, 
  Download, 
  ExternalLink,
  CheckCircle,
  Bookmark
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

interface ScheduledVisitCardProps {
  visit: ScheduledVisit;
  onEdit: () => void;
  onRefresh: () => void;
  isPast?: boolean;
}

export function ScheduledVisitCard({ visit, onEdit, onRefresh, isPast = false }: ScheduledVisitCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);

  const mealTypeLabels: Record<string, string> = {
    breakfast: t("agenda.mealTypes.breakfast"),
    lunch: t("agenda.mealTypes.lunch"),
    dinner: t("agenda.mealTypes.dinner"),
    drinks: t("agenda.mealTypes.drinks"),
    other: t("agenda.mealTypes.other"),
  };

  const statusLabels: Record<string, string> = {
    planned: t("agenda.status.planned"),
    booked: t("agenda.status.booked"),
    confirmed: t("agenda.status.confirmed"),
    completed: t("agenda.status.completed"),
    canceled: t("agenda.status.canceled"),
  };

  const statusColors: Record<string, string> = {
    planned: "bg-muted text-muted-foreground",
    booked: "bg-blue-500/10 text-blue-600",
    confirmed: "bg-green-500/10 text-green-600",
    completed: "bg-accent/10 text-accent",
    canceled: "bg-destructive/10 text-destructive",
  };

  const handleDownloadICS = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-ics', {
        body: { visitId: visit.id },
      });

      if (error) throw error;

      // Create blob and download
      const blob = new Blob([data.icsContent], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${visit.restaurant_name.replace(/\s+/g, '-')}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: t("agenda.toasts.calendarDownloaded"),
      });
    } catch (error) {
      console.error("Error downloading ICS:", error);
      toast({
        title: t("common.error") || "Error",
        description: "Failed to download calendar event",
        variant: "destructive",
      });
    }
  };

  const handleOpenMaps = () => {
    if (visit.maps_url) {
      window.open(visit.maps_url, '_blank');
    } else if (visit.location_address) {
      const query = encodeURIComponent(`${visit.restaurant_name} ${visit.location_address}`);
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    } else {
      const query = encodeURIComponent(`${visit.restaurant_name} ${visit.city}`);
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    }
  };

  const handleCall = () => {
    if (visit.phone) {
      window.location.href = `tel:${visit.phone}`;
    }
  };

  const handleMarkAsBooked = async () => {
    const { error } = await supabase
      .from("scheduled_visits")
      .update({ status: "booked" })
      .eq("id", visit.id);

    if (!error) {
      toast({ title: t("agenda.toasts.statusUpdated") });
      onRefresh();
    }
  };

  const handleMarkAsCompleted = async () => {
    const { error } = await supabase
      .from("scheduled_visits")
      .update({ status: "completed" })
      .eq("id", visit.id);

    if (!error) {
      toast({ title: t("agenda.toasts.statusUpdated") });
      onRefresh();
      setShowCompleteDialog(true);
    }
  };

  const handleRecordExperience = async () => {
    // Check if experience already exists for this visit
    const { data: existingEntry } = await supabase
      .from("restaurant_entries")
      .select("id")
      .eq("origin_scheduled_visit_id", visit.id)
      .maybeSingle();

    if (existingEntry) {
      navigate(`/dining/${existingEntry.id}`);
    } else {
      // Navigate to add restaurant with prefilled data
      const params = new URLSearchParams({
        restaurant_name: visit.restaurant_name,
        city: visit.city,
        origin_scheduled_visit_id: visit.id,
        ...(visit.location_address && { location_address: visit.location_address }),
        ...(visit.google_place_id && { google_place_id: visit.google_place_id }),
      });
      navigate(`/dining/add?${params.toString()}`);
    }
  };

  const formattedDate = format(new Date(visit.start_datetime), "PPP", {
    locale: language === "pt" ? undefined : undefined,
  });
  const formattedTime = format(new Date(visit.start_datetime), "HH:mm");

  const isOverdue = !isPast && new Date(visit.start_datetime) < new Date() && visit.status !== "completed";

  return (
    <>
      <Card className={`group hover:shadow-large transition-all ${isOverdue ? 'border-amber-500/50' : ''}`}>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            {/* Main Info */}
            <div className="flex-1">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-lg">{visit.restaurant_name}</h3>
                    <Badge className={statusColors[visit.status]}>
                      {statusLabels[visit.status]}
                    </Badge>
                    {visit.source === "ai" && (
                      <Badge variant="outline" className="text-xs">AI</Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formattedDate} • {formattedTime}
                    </span>
                    <span className="px-2 py-0.5 bg-secondary rounded text-xs">
                      {mealTypeLabels[visit.meal_type]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <MapPin className="h-4 w-4" />
                <span>{visit.city}</span>
                {visit.location_address && (
                  <span className="text-xs">• {visit.location_address}</span>
                )}
              </div>

              {visit.notes && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                  {visit.notes}
                </p>
              )}

              {visit.party_size && (
                <p className="text-xs text-primary mt-1">
                  👥 {visit.party_size} {visit.party_size === 1 ? 'pessoa' : 'pessoas'}
                </p>
              )}

              {visit.booking_ref && (
                <p className="text-xs text-muted-foreground mt-1">
                  Ref: {visit.booking_ref}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadICS}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenMaps}>
                <ExternalLink className="h-4 w-4" />
              </Button>
              {visit.phone && (
                <Button variant="outline" size="sm" onClick={handleCall}>
                  <Phone className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit className="h-4 w-4" />
              </Button>
              
              {/* Status-based actions */}
              {visit.status === "planned" && !isPast && (
                <Button variant="secondary" size="sm" onClick={handleMarkAsBooked}>
                  <Bookmark className="h-4 w-4 mr-1" />
                  {t("agenda.actions.markAsBooked")}
                </Button>
              )}
              
              {(isOverdue || isPast) && visit.status !== "completed" && (
                <Button variant="secondary" size="sm" onClick={handleMarkAsCompleted}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t("agenda.actions.markAsCompleted")}
                </Button>
              )}
              
              {(isPast || visit.status === "completed") && (
                <Button variant="default" size="sm" onClick={handleRecordExperience}>
                  <Star className="h-4 w-4 mr-1" />
                  {t("agenda.actions.recordExperience")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Complete and Record Experience Dialog */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("agenda.promptRecordExperience")}</AlertDialogTitle>
            <AlertDialogDescription>
              {visit.restaurant_name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.no")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecordExperience}>
              {t("common.yes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}