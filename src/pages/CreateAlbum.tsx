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
import { useI18n } from "@/i18n/i18n";

export default function CreateAlbum() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();
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

      // Create album without cover image (will use photo collage)
      const { error } = await supabase.from("albums").insert({
        ...formData,
        user_id: user.id,
      });

      if (error) throw error;

      toast({
        title: t("albums.created"),
        description: t("albums.albumCreatedDesc"),
      });

      navigate("/dining?tab=albums");
    } catch (error: any) {
      toast({
        title: t("common.error"),
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
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
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
            <h1 className="text-3xl font-bold">{t("albums.createAlbum")}</h1>
          </div>

          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle>{t("albums.albumDetails")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Album Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">{t("albums.albumTitle")} *</Label>
                  <Input
                    id="title"
                    type="text"
                    placeholder={t("albums.albumTitlePlaceholder")}
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">{t("albums.description")}</Label>
                  <Textarea
                    id="description"
                    placeholder={t("albums.descriptionPlaceholder")}
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
                    {loading ? t("albums.creating") : t("albums.create")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(-1)}
                  >
                    {t("albums.cancel")}
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
