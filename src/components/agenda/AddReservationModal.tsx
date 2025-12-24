import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addMinutes } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { cn } from "@/lib/utils";

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

interface AddReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editingVisit: ScheduledVisit | null;
}

export function AddReservationModal({
  isOpen,
  onClose,
  onSave,
  editingVisit,
}: AddReservationModalProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  // Form state
  const [restaurantName, setRestaurantName] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("19:00");
  const [duration, setDuration] = useState(90);
  const [mealType, setMealType] = useState("dinner");
  const [status, setStatus] = useState("planned");
  const [partySize, setPartySize] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");

  // Reset form when modal opens/closes or editing visit changes
  useEffect(() => {
    if (editingVisit) {
      setRestaurantName(editingVisit.restaurant_name);
      setCity(editingVisit.city);
      setDate(new Date(editingVisit.start_datetime));
      setTime(format(new Date(editingVisit.start_datetime), "HH:mm"));
      
      const startTime = new Date(editingVisit.start_datetime);
      const endTime = new Date(editingVisit.end_datetime);
      const diffMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      setDuration(diffMinutes);
      
      setMealType(editingVisit.meal_type);
      setStatus(editingVisit.status);
      setPartySize(editingVisit.party_size?.toString() || "");
      setBookingRef(editingVisit.booking_ref || "");
      setNotes(editingVisit.notes || "");
      setPhone(editingVisit.phone || "");
      setWebsite(editingVisit.website || "");
      setAddress(editingVisit.location_address || "");
    } else {
      setRestaurantName("");
      setCity("");
      setDate(undefined);
      setTime("19:00");
      setDuration(90);
      setMealType("dinner");
      setStatus("planned");
      setPartySize("");
      setBookingRef("");
      setNotes("");
      setPhone("");
      setWebsite("");
      setAddress("");
    }
  }, [editingVisit, isOpen]);

  const handleSave = async () => {
    if (!restaurantName.trim() || !city.trim() || !date) {
      toast({
        title: t("common.required"),
        description: "Please fill in restaurant name, city, and date",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Combine date and time
      const [hours, minutes] = time.split(":").map(Number);
      const startDateTime = new Date(date);
      startDateTime.setHours(hours, minutes, 0, 0);
      const endDateTime = addMinutes(startDateTime, duration);

      const visitData = {
        user_id: user.id,
        restaurant_name: restaurantName.trim(),
        city: city.trim(),
        start_datetime: startDateTime.toISOString(),
        end_datetime: endDateTime.toISOString(),
        meal_type: mealType,
        status,
        party_size: partySize ? parseInt(partySize) : null,
        booking_ref: bookingRef || null,
        notes: notes || null,
        phone: phone || null,
        website: website || null,
        location_address: address || null,
        source: "manual",
      };

      if (editingVisit) {
        const { error } = await supabase
          .from("scheduled_visits")
          .update(visitData)
          .eq("id", editingVisit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("scheduled_visits")
          .insert(visitData);
        if (error) throw error;
      }

      toast({ title: t("agenda.toasts.saved") });
      onSave();
    } catch (error: any) {
      console.error("Error saving reservation:", error);
      toast({
        title: t("common.error") || "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingVisit ? t("agenda.modal.editTitle") : t("agenda.modal.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Restaurant Name */}
          <div className="space-y-2">
            <Label>{t("agenda.modal.restaurant")} *</Label>
            <Input
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder={t("agenda.modal.restaurantPlaceholder")}
            />
          </div>

          {/* City */}
          <div className="space-y-2">
            <Label>{t("agenda.modal.city")} *</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t("agenda.modal.cityPlaceholder")}
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("agenda.modal.dateTime")} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label className="invisible">Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Duration and Meal Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("agenda.modal.duration")}</Label>
              <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60 min</SelectItem>
                  <SelectItem value="90">90 min</SelectItem>
                  <SelectItem value="120">120 min</SelectItem>
                  <SelectItem value="180">180 min</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("agenda.modal.mealType")}</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">{t("agenda.mealTypes.breakfast")}</SelectItem>
                  <SelectItem value="lunch">{t("agenda.mealTypes.lunch")}</SelectItem>
                  <SelectItem value="dinner">{t("agenda.mealTypes.dinner")}</SelectItem>
                  <SelectItem value="drinks">{t("agenda.mealTypes.drinks")}</SelectItem>
                  <SelectItem value="other">{t("agenda.mealTypes.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status and Party Size */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("agenda.modal.status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">{t("agenda.status.planned")}</SelectItem>
                  <SelectItem value="booked">{t("agenda.status.booked")}</SelectItem>
                  <SelectItem value="confirmed">{t("agenda.status.confirmed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("agenda.modal.partySize")}</Label>
              <Input
                type="number"
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                placeholder={t("agenda.modal.partySizePlaceholder")}
                min="1"
              />
            </div>
          </div>

          {/* Booking Reference */}
          <div className="space-y-2">
            <Label>{t("agenda.modal.bookingRef")}</Label>
            <Input
              value={bookingRef}
              onChange={(e) => setBookingRef(e.target.value)}
              placeholder={t("agenda.modal.bookingRefPlaceholder")}
            />
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label>{t("agenda.modal.address")}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("agenda.modal.addressPlaceholder")}
            />
          </div>

          {/* Phone and Website */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("agenda.modal.phone")}</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("agenda.modal.phonePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("agenda.modal.website")}</Label>
              <Input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder={t("agenda.modal.websitePlaceholder")}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t("agenda.modal.notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("agenda.modal.notesPlaceholder")}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}