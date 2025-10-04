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

  const [newAlbum, setNewAlbum] = useState({
    title: "",
    description: "",
  });

  useEffect(() => {
    fetchAlbums();
  }, []);

  const fetchAlbums = async () => {
    const { data } = await supabase
      .from("albums")
      .select("*")
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
        title: "Album created!",
        description: "Your new album is ready",
      });

      // Add to list and select it
      setAlbums([data, ...albums]);
      onAlbumSelect(data.id);
      setDialogOpen(false);
      setNewAlbum({ title: "", description: "" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Add to Album (Optional)</Label>
      <div className="flex gap-2">
        <Select value={selectedAlbumId || "none"} onValueChange={(value) => onAlbumSelect(value === "none" ? undefined : value)}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={loading ? "Loading albums..." : "Select an album"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No album</SelectItem>
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
              size="icon"
              onClick={(e) => e.stopPropagation()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Album</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAlbum} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="album-title">Album Title *</Label>
                <Input
                  id="album-title"
                  placeholder="Summer in Tuscany"
                  value={newAlbum.title}
                  onChange={(e) =>
                    setNewAlbum({ ...newAlbum, title: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="album-description">Description</Label>
                <Textarea
                  id="album-description"
                  placeholder="A collection of memorable dining experiences..."
                  rows={3}
                  value={newAlbum.description}
                  onChange={(e) =>
                    setNewAlbum({ ...newAlbum, description: e.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create Album"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
