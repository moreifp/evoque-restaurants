import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function CreateAlbum() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Generate AI cover image
      toast({
        title: "Generating album cover...",
        description: "Creating a beautiful AI image for your album",
      });

      const { data: imageData, error: imageError } = await supabase.functions.invoke(
        'generate-album-cover',
        {
          body: {
            title: formData.title,
            description: formData.description,
          },
        }
      );

      let coverImageUrl = null;

      if (imageError) {
        console.error('Error generating cover:', imageError);
        toast({
          title: "Cover generation failed",
          description: "Creating album without cover image. You can add one later.",
          variant: "destructive",
        });
      } else if (imageData?.imageUrl) {
        // Upload the base64 image to storage
        const base64Data = imageData.imageUrl.split(',')[1];
        const blob = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        const fileName = `${user.id}/${crypto.randomUUID()}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('dining_entries')
          .upload(fileName, blob, {
            contentType: 'image/png',
            upsert: false,
          });

        if (!uploadError && uploadData) {
          const { data: { publicUrl } } = supabase.storage
            .from('dining_entries')
            .getPublicUrl(fileName);
          coverImageUrl = publicUrl;
        }
      }

      // Create album with cover image
      const { error } = await supabase.from("albums").insert({
        ...formData,
        user_id: user.id,
        cover_image_url: coverImageUrl,
      });

      if (error) throw error;

      toast({
        title: "Album created!",
        description: coverImageUrl 
          ? "Your album has been created with an AI-generated cover"
          : "Your album has been created successfully",
      });

      navigate("/albums");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center space-x-4 mb-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">Create Album</h1>
          </div>

          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle>Album Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Album Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Album Title *</Label>
                  <Input
                    id="title"
                    type="text"
                    placeholder="Summer in Tuscany"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="A collection of memorable dining experiences from our summer trip..."
                    rows={5}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>

                {/* Submit */}
                <div className="flex items-center space-x-4">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? "Creating..." : "Create Album"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(-1)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
