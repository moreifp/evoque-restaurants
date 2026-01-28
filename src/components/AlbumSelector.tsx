import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";

interface AlbumSelectorProps {
  selectedAlbumId?: string;
  onAlbumSelect: (albumId: string | undefined) => void;
}

export function AlbumSelector({ selectedAlbumId, onAlbumSelect }: AlbumSelectorProps) {
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  const [newAlbum, setNewAlbum] = useState({
    title: "",
    description: "",
  });

  useEffect(() => {
    fetchAlbums();
  }, []);

  const fetchAlbums = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("albums")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    
    if (data) setAlbums(data);
    setLoading(false);
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event from bubbling to parent form
    setCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("albums")
        .insert({
          ...newAlbum,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: t("albumSelector.albumCreated"),
        description: t("albumSelector.albumCreatedDesc"),
      });

      // Add to list and select it
      const newAlbums = [data, ...albums];
      setAlbums(newAlbums);
      setDialogOpen(false);
      setNewAlbum({ title: "", description: "" });
      
      // Ensure the new album is selected by calling onAlbumSelect after state update
      setTimeout(() => {
        onAlbumSelect(data.id);
      }, 0);
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally{
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-lg">{t("albumSelector.title")}</Label>
      <div className="flex gap-2">
        <Select value={selectedAlbumId || "none"} onValueChange={(value) => onAlbumSelect(value === "none" ? undefined : value)}>
          <SelectTrigger className="flex-1 h-12 text-lg">
            <SelectValue placeholder={loading ? t("albumSelector.loading") : t("albumSelector.selectPlaceholder")} />
          </SelectTrigger>
          <SelectContent className="text-lg">
            <SelectItem value="none">{t("albumSelector.noAlbum")}</SelectItem>
            {albums.map((album) => (
              <SelectItem key={album.id} value={album.id}>
                {album.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              type="button" 
              variant="outline" 
              className="h-12 w-12"
              onClick={(e) => e.stopPropagation()}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("albumSelector.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAlbum} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="album-title" className="text-lg">{t("albumSelector.albumTitleLabel")}</Label>
                <Input
                  id="album-title"
                  placeholder={t("albumSelector.albumTitlePlaceholder")}
                  value={newAlbum.title}
                  onChange={(e) =>
                    setNewAlbum({ ...newAlbum, title: e.target.value })
                  }
                  className="text-lg h-12"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="album-description" className="text-lg">{t("albumSelector.descriptionLabel")}</Label>
                <Textarea
                  id="album-description"
                  placeholder={t("albumSelector.descriptionPlaceholder")}
                  rows={3}
                  value={newAlbum.description}
                  onChange={(e) =>
                    setNewAlbum({ ...newAlbum, description: e.target.value })
                  }
                  className="text-lg min-h-[100px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? t("albumSelector.creating") : t("albumSelector.createAlbum")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
