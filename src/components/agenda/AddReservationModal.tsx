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
import { CalendarIcon, Clock, MapPin, Loader2, RefreshCw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { cn } from "@/lib/utils";
import { RestaurantAutocomplete } from "@/components/RestaurantAutocomplete";

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
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
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
  const [placeSelected, setPlaceSelected] = useState(false);
  
  // Track which fields were auto-filled by Google Places
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  // Track which fields are currently animating
  const [animatingFields, setAnimatingFields] = useState<Set<string>>(new Set());
  // Loading state for fetching Google details
  const [fetchingDetails, setFetchingDetails] = useState(false);
  // Error state for failed fetch
  const [fetchError, setFetchError] = useState(false);
  // Validation errors for required fields
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  // Track if user attempted to submit
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // Track if draft was restored
  const [draftRestored, setDraftRestored] = useState(false);

  const DRAFT_KEY = 'reservation-draft';

  // Draft interface
  interface ReservationDraft {
    restaurantName: string;
    googlePlaceId: string | null;
    city: string;
    date: string | null;
    time: string;
    duration: number;
    mealType: string;
    status: string;
    partySize: string;
    bookingRef: string;
    notes: string;
    phone: string;
    website: string;
    address: string;
    savedAt: number;
  }

  // Save draft to localStorage
  const saveDraft = () => {
    if (editingVisit) return; // Don't save draft when editing
    
    const draft: ReservationDraft = {
      restaurantName,
      googlePlaceId,
      city,
      date: date?.toISOString() || null,
      time,
      duration,
      mealType,
      status,
      partySize,
      bookingRef,
      notes,
      phone,
      website,
      address,
      savedAt: Date.now(),
    };
    
    // Only save if there's meaningful data
    if (restaurantName || city || notes || address) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  };

  // Load draft from localStorage
  const loadDraft = (): ReservationDraft | null => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return null;
      
      const draft: ReservationDraft = JSON.parse(saved);
      
      // Check if draft is less than 24 hours old
      const ONE_DAY = 24 * 60 * 60 * 1000;
      if (Date.now() - draft.savedAt > ONE_DAY) {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }
      
      return draft;
    } catch {
      return null;
    }
  };

  // Clear draft from localStorage
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftRestored(false);
  };

  // Auto-save draft when form changes
  useEffect(() => {
    if (!editingVisit && isOpen) {
      const timeoutId = setTimeout(saveDraft, 500); // Debounce 500ms
      return () => clearTimeout(timeoutId);
    }
  }, [restaurantName, city, date, time, duration, mealType, status, partySize, bookingRef, notes, phone, website, address, editingVisit, isOpen]);

  // Reset form when modal opens/closes or editing visit changes
  useEffect(() => {
    if (editingVisit) {
      setRestaurantName(editingVisit.restaurant_name);
      setGooglePlaceId(editingVisit.google_place_id);
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
      setPlaceSelected(!!editingVisit.google_place_id);
    } else if (isOpen) {
      // Try to restore draft when opening new reservation
      const draft = loadDraft();
      if (draft && (draft.restaurantName || draft.city || draft.notes)) {
        setRestaurantName(draft.restaurantName);
        setGooglePlaceId(draft.googlePlaceId);
        setCity(draft.city);
        setDate(draft.date ? new Date(draft.date) : undefined);
        setTime(draft.time);
        setDuration(draft.duration);
        setMealType(draft.mealType);
        setStatus(draft.status);
        setPartySize(draft.partySize);
        setBookingRef(draft.bookingRef);
        setNotes(draft.notes);
        setPhone(draft.phone);
        setWebsite(draft.website);
        setAddress(draft.address);
        setDraftRestored(true);
        
        toast({
          title: "Rascunho restaurado",
          description: "Seus dados anteriores foram recuperados",
        });
      } else {
        // Reset to defaults
        setRestaurantName("");
        setGooglePlaceId(null);
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
        setDraftRestored(false);
      }
      setPlaceSelected(false);
      setAutoFilledFields(new Set());
      setAnimatingFields(new Set());
      setFetchingDetails(false);
      setFetchError(false);
      setValidationErrors(new Set());
      setAttemptedSubmit(false);
    }
  }, [editingVisit, isOpen]);

  // Fetch details from backend using place_id
  const fetchDetailsFromBackend = async (placeId: string, name: string) => {
    console.log(`[AddReservationModal] Fetching details from backend for place_id: ${placeId}`);
    setFetchingDetails(true);
    setFetchError(false);
    
    try {
      const { data, error } = await supabase.functions.invoke('enrich-restaurant-data', {
        body: { google_place_id: placeId, restaurant_name: name }
      });

      console.log(`[AddReservationModal] Backend response:`, data, error);

      if (error) {
        console.error('[AddReservationModal] Backend error:', error);
        setFetchError(true);
        return;
      }

      if (data?.success && data?.data) {
        const enriched = data.data;
        const filledFields = new Set<string>();
        
        if (enriched.city && !city) {
          setCity(enriched.city);
          filledFields.add('city');
        }
        if (enriched.location_address && !address) {
          setAddress(enriched.location_address);
          filledFields.add('address');
        }
        if (enriched.phone && !phone) {
          setPhone(enriched.phone);
          filledFields.add('phone');
        }
        if (enriched.website && !website) {
          setWebsite(enriched.website);
          filledFields.add('website');
        }
        
        if (filledFields.size > 0) {
          setAutoFilledFields(prev => new Set([...prev, ...filledFields]));
          setAnimatingFields(new Set(filledFields));
          setTimeout(() => setAnimatingFields(new Set()), 800);
          
          toast({
            title: "Dados encontrados",
            description: `Preenchemos ${filledFields.size} campo(s) automaticamente`,
          });
        }
        
        console.log(`[AddReservationModal] Filled fields from backend:`, [...filledFields]);
      }
    } catch (err) {
      console.error('[AddReservationModal] Error fetching from backend:', err);
      setFetchError(true);
    } finally {
      setFetchingDetails(false);
    }
  };

  const handlePlaceSelect = async (place: {
    name: string;
    address: string;
    placeId: string;
    phone?: string;
    website?: string;
    city?: string;
  }) => {
    console.log(`[AddReservationModal] Place selected:`, place);
    
    const filledFields = new Set<string>();
    
    setRestaurantName(place.name);
    setGooglePlaceId(place.placeId);
    
    // Check if we got complete data from client-side
    const hasCompleteData = place.city && place.address && (place.phone || place.website);
    
    if (place.address) {
      setAddress(place.address);
      filledFields.add('address');
    }
    if (place.phone) {
      setPhone(place.phone);
      filledFields.add('phone');
    }
    if (place.website) {
      setWebsite(place.website);
      filledFields.add('website');
    }
    if (place.city) {
      setCity(place.city);
      filledFields.add('city');
    }
    
    setAutoFilledFields(filledFields);
    setAnimatingFields(new Set(filledFields));
    setPlaceSelected(true);
    
    // Clear animation state after animation completes
    setTimeout(() => {
      setAnimatingFields(new Set());
    }, 800);
    
    // If client-side data is incomplete, fetch from backend
    if (!hasCompleteData && place.placeId) {
      console.log(`[AddReservationModal] Incomplete data from client, fetching from backend...`);
      await fetchDetailsFromBackend(place.placeId, place.name);
    }
  };

  // Manual retry button handler
  const handleRetryFetch = async () => {
    if (googlePlaceId && restaurantName) {
      await fetchDetailsFromBackend(googlePlaceId, restaurantName);
    } else if (restaurantName && city) {
      // Try text search if we don't have place_id
      setFetchingDetails(true);
      setFetchError(false);
      try {
        const { data, error } = await supabase.functions.invoke('enrich-restaurant-data', {
          body: { restaurant_name: restaurantName, city }
        });
        
        if (error) {
          setFetchError(true);
          return;
        }
        
        if (data?.success && data?.data) {
          const enriched = data.data;
          const filledFields = new Set<string>();
          
          if (enriched.google_place_id) {
            setGooglePlaceId(enriched.google_place_id);
          }
          if (enriched.location_address && !address) {
            setAddress(enriched.location_address);
            filledFields.add('address');
          }
          if (enriched.phone && !phone) {
            setPhone(enriched.phone);
            filledFields.add('phone');
          }
          if (enriched.website && !website) {
            setWebsite(enriched.website);
            filledFields.add('website');
          }
          
          if (filledFields.size > 0) {
            setAutoFilledFields(prev => new Set([...prev, ...filledFields]));
            setAnimatingFields(new Set(filledFields));
            setTimeout(() => setAnimatingFields(new Set()), 800);
            setPlaceSelected(true);
            
            toast({
              title: "Dados encontrados",
              description: `Preenchemos ${filledFields.size} campo(s) automaticamente`,
            });
          } else {
            toast({
              title: "Nenhum dado encontrado",
              description: "Preencha os campos manualmente",
              variant: "destructive",
            });
          }
        }
      } catch (err) {
        setFetchError(true);
      } finally {
        setFetchingDetails(false);
      }
    }
  };

  // Helper to render Google Places badge
  const GooglePlacesBadge = ({ field }: { field: string }) => {
    if (!autoFilledFields.has(field)) return null;
    return (
      <Badge variant="secondary" className="ml-2 text-xs bg-green-100 text-green-700 hover:bg-green-100">
        <MapPin className="w-3 h-3 mr-1" />
        Google
      </Badge>
    );
  };

  const enrichVisitData = async (visitId: string, restaurantName: string, city: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('enrich-restaurant-data', {
        body: { restaurant_name: restaurantName, city }
      });

      if (error) {
        console.error('Error enriching restaurant data:', error);
        return;
      }

      if (data?.success && data?.data) {
        const enrichedData = data.data;
        // Update the visit with enriched data
        const { error: updateError } = await supabase
          .from('scheduled_visits')
          .update({
            google_place_id: enrichedData.google_place_id,
            location_address: enrichedData.location_address,
            phone: enrichedData.phone,
            website: enrichedData.website,
            maps_url: enrichedData.maps_url,
          })
          .eq('id', visitId);

        if (updateError) {
          console.error('Error updating visit with enriched data:', updateError);
        } else {
          console.log('Visit enriched with Google Places data');
        }
      }
    } catch (err) {
      console.error('Error calling enrich function:', err);
    }
  };

  // Validate required fields
  const validateForm = (): boolean => {
    const errors = new Set<string>();
    
    if (!restaurantName.trim()) errors.add('restaurant');
    if (!city.trim()) errors.add('city');
    if (!date) errors.add('date');
    
    setValidationErrors(errors);
    setAttemptedSubmit(true);
    
    return errors.size === 0;
  };

  // Clear validation error when field is filled
  const clearValidationError = (field: string) => {
    if (validationErrors.has(field)) {
      setValidationErrors(prev => {
        const newSet = new Set(prev);
        newSet.delete(field);
        return newSet;
      });
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast({
        title: t("common.required"),
        description: "Preencha os campos obrigatórios destacados em vermelho",
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
        google_place_id: googlePlaceId,
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

      let savedVisitId: string | null = null;

      if (editingVisit) {
        const { error } = await supabase
          .from("scheduled_visits")
          .update(visitData)
          .eq("id", editingVisit.id);
        if (error) throw error;
        savedVisitId = editingVisit.id;
      } else {
        const { data: insertedData, error } = await supabase
          .from("scheduled_visits")
          .insert(visitData)
          .select('id')
          .single();
        if (error) throw error;
        savedVisitId = insertedData?.id || null;
      }

      // Auto-enrich with Google Places data only if user didn't select from autocomplete
      if (savedVisitId && !placeSelected && !address && !phone && !website) {
        // Run enrichment in background (don't block UI)
        enrichVisitData(savedVisitId, restaurantName.trim(), city.trim());
      }

      // Clear draft after successful save
      clearDraft();
      
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }} modal={false}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              {editingVisit ? t("agenda.modal.editTitle") : t("agenda.modal.addTitle")}
            </DialogTitle>
            {!editingVisit && draftRestored && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearDraft();
                  setRestaurantName("");
                  setGooglePlaceId(null);
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
                  toast({ title: "Rascunho descartado" });
                }}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Descartar rascunho
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Draft saved indicator */}
        {!editingVisit && (restaurantName || city || notes) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Save className="h-3 w-3" />
            <span>Rascunho salvo automaticamente</span>
          </div>
        )}

        <div className="space-y-4 mt-4">
          {/* Restaurant Name */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className={cn(validationErrors.has('restaurant') && "text-destructive")}>
                {t("agenda.modal.restaurant")} *
              </Label>
              {validationErrors.has('restaurant') && (
                <span className="text-xs text-destructive">Campo obrigatório</span>
              )}
            </div>
            <div className={cn(
              "rounded-md",
              validationErrors.has('restaurant') && "ring-2 ring-destructive ring-offset-1"
            )}>
              <RestaurantAutocomplete
                value={restaurantName}
                onChange={(val) => {
                  setRestaurantName(val);
                  clearValidationError('restaurant');
                  if (placeSelected) {
                    setPlaceSelected(false);
                    setGooglePlaceId(null);
                    setAutoFilledFields(new Set());
                  }
                }}
                onPlaceSelect={handlePlaceSelect}
                placeholder={t("agenda.modal.restaurantPlaceholder")}
              />
            </div>
            
            {/* Loading indicator for fetching details */}
            {fetchingDetails && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground animate-fade-in">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Buscando dados do Google...</span>
              </div>
            )}
            
            {/* Retry button if fetch failed or user wants to search */}
            {!fetchingDetails && restaurantName && city && !placeSelected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRetryFetch}
                className="text-sm text-primary hover:text-primary/80"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Buscar detalhes do Google
              </Button>
            )}
            
            {/* Error message */}
            {fetchError && !fetchingDetails && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <span>Não conseguimos buscar os detalhes automaticamente.</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRetryFetch}
                  className="text-amber-600 hover:text-amber-700 p-0 h-auto"
                >
                  Tentar novamente
                </Button>
              </div>
            )}
          </div>

          {/* City */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label className={cn(validationErrors.has('city') && "text-destructive")}>
                  {t("agenda.modal.city")} *
                </Label>
                <GooglePlacesBadge field="city" />
              </div>
              {validationErrors.has('city') && (
                <span className="text-xs text-destructive">Campo obrigatório</span>
              )}
            </div>
            <Input
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                clearValidationError('city');
              }}
              placeholder={t("agenda.modal.cityPlaceholder")}
              className={cn(
                animatingFields.has('city') && 'animate-field-highlight',
                validationErrors.has('city') && 'border-destructive ring-1 ring-destructive'
              )}
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className={cn(validationErrors.has('date') && "text-destructive")}>
                  {t("agenda.modal.dateTime")} *
                </Label>
                {validationErrors.has('date') && (
                  <span className="text-xs text-destructive">Obrigatório</span>
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground",
                      validationErrors.has('date') && "border-destructive ring-1 ring-destructive"
                    )}
                    onClick={() => clearValidationError('date')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d);
                      clearValidationError('date');
                    }}
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
            <div className="flex items-center">
              <Label>{t("agenda.modal.address")}</Label>
              <GooglePlacesBadge field="address" />
            </div>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("agenda.modal.addressPlaceholder")}
              className={animatingFields.has('address') ? 'animate-field-highlight' : ''}
            />
          </div>

          {/* Phone and Website */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t("agenda.modal.phone")}</Label>
                <GooglePlacesBadge field="phone" />
              </div>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("agenda.modal.phonePlaceholder")}
                className={animatingFields.has('phone') ? 'animate-field-highlight' : ''}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t("agenda.modal.website")}</Label>
                <GooglePlacesBadge field="website" />
              </div>
              <Input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder={t("agenda.modal.websitePlaceholder")}
                className={animatingFields.has('website') ? 'animate-field-highlight' : ''}
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