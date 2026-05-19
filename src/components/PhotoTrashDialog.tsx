import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Trash2, RotateCcw, ImageOff, Loader2 } from "lucide-react";
import { usePhotoTrash, type PhotoBackup } from "@/hooks/usePhotoTrash";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId?: string;
}

export function PhotoTrashDialog({ open, onOpenChange, entryId }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { backups, loading, restore, purge, retentionDays } = usePhotoTrash();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => (entryId ? backups.filter((b) => b.entry_id === entryId) : backups),
    [backups, entryId]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, PhotoBackup[]>();
    for (const b of visible) {
      const key = b.restaurant_name || t("photoTrash.unknownRestaurant");
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [visible, t]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(visible.map((b) => b.id)));
  const clearSel = () => setSelected(new Set());

  const handleRestore = async () => {
    setBusy(true);
    try {
      const { restored, missing } = await restore(Array.from(selected));
      toast({
        title: t("photoTrash.restored"),
        description: t("photoTrash.restoredDesc").replace("{n}", String(restored)),
      });
      if (missing.length) {
        toast({
          title: t("photoTrash.someMissing"),
          description: t("photoTrash.missingDesc").replace("{n}", String(missing.length)),
          variant: "destructive",
        });
      }
      clearSel();
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handlePurge = async () => {
    setBusy(true);
    try {
      await purge(Array.from(selected));
      toast({ title: t("photoTrash.purged") });
      clearSel();
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const daysLeft = (deletedAt: string) => {
    const ms = new Date(deletedAt).getTime() + retentionDays * 86400000 - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            {t("photoTrash.title")}
          </DialogTitle>
          <DialogDescription>
            {t("photoTrash.description").replace("{days}", String(retentionDays))}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 py-2">
          <div className="text-sm text-muted-foreground">
            {t("photoTrash.selectedCount").replace("{n}", String(selected.size))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll} disabled={!visible.length}>
              {t("photoTrash.selectAll")}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSel} disabled={!selected.size}>
              {t("photoTrash.clearSelection")}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 pr-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t("common.loading")}
            </div>
          ) : !visible.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ImageOff className="h-10 w-10 mb-2 opacity-50" />
              <p>{t("photoTrash.empty")}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([name, items]) => (
                <div key={name}>
                  <h4 className="font-medium text-sm mb-2">{name}</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {items.map((b) => {
                      const isVideo = (b.type || "").includes("video") || /\.(mp4|mov|webm)$/i.test(b.photo_url);
                      const days = daysLeft(b.deleted_at);
                      return (
                        <button
                          type="button"
                          key={b.id}
                          onClick={() => toggle(b.id)}
                          className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                            selected.has(b.id) ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                          }`}
                        >
                          {isVideo ? (
                            <video src={b.photo_url} className="w-full aspect-square object-cover bg-muted" muted />
                          ) : (
                            <img src={b.photo_url} alt={b.caption || ""} className="w-full aspect-square object-cover bg-muted" loading="lazy" />
                          )}
                          <div className="absolute top-2 left-2">
                            <Checkbox checked={selected.has(b.id)} className="bg-background/80 backdrop-blur" />
                          </div>
                          <Badge variant="secondary" className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0">
                            {t("photoTrash.daysLeft").replace("{n}", String(days))}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handlePurge}
            disabled={!selected.size || busy}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t("photoTrash.deleteForever")}
          </Button>
          <Button onClick={handleRestore} disabled={!selected.size || busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            {t("photoTrash.restoreSelected")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
