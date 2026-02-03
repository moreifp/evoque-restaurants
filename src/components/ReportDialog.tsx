import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: "restaurant" | "album" | "user";
  targetId: string;
  targetUserId: string;
}

export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetUserId,
}: ReportDialogProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("content_reports").insert({
        reporter_id: user.id,
        target_type: targetType,
        target_id: targetId,
        target_user_id: targetUserId,
        reason,
        details: details.trim() || null,
      });

      if (error) throw error;

      toast({
        title: t("report.success"),
        description: t("report.successDesc"),
      });

      onOpenChange(false);
      setReason("");
      setDetails("");
    } catch (error: any) {
      toast({
        title: t("report.failed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getTitle = () => {
    switch (targetType) {
      case "restaurant":
        return t("report.reportRestaurant");
      case "album":
        return t("report.reportAlbum");
      case "user":
        return t("report.reportUser");
      default:
        return t("report.title");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{t("report.reason")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={reason} onValueChange={setReason}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="inappropriate" id="inappropriate" />
              <Label htmlFor="inappropriate">{t("report.inappropriate")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="spam" id="spam" />
              <Label htmlFor="spam">{t("report.spam")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="offensive" id="offensive" />
              <Label htmlFor="offensive">{t("report.offensive")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="other" id="other" />
              <Label htmlFor="other">{t("report.other")}</Label>
            </div>
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="details">{t("report.details")}</Label>
            <Textarea
              id="details"
              placeholder={t("report.detailsPlaceholder")}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!reason || submitting}
            >
              {submitting ? t("common.loading") : t("report.submit")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
