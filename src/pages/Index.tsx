import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, BookImage, Search, UtensilsCrossed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";
import { useRestaurantEntries } from "@/hooks/useRestaurantEntries";
import evoqueIcon from "@/assets/evoque-icon.png";

export default function Index() {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [popularTags, setPopularTags] = useState<any[]>([]);
  
  // Use shared hook for consistent cache with Dining page
  const { data: allEntries = [], isLoading: loading } = useRestaurantEntries();
  const recentEntries = allEntries.filter((e) => !e.is_draft).slice(0, 6);

  useEffect(() => {
    fetchPopularTags();
  }, []);

  const fetchPopularTags = async () => {
    const { data } = await supabase.from("tags").select("*").limit(10);

    if (data) setPopularTags(data);
  };

  const handleTagClick = (tagId: string) => {
    navigate(`/dining?tag=${tagId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        {/* Branding Header */}
        <div className="flex items-center justify-center gap-3 mb-8 animate-fade-in">
          <img src={evoqueIcon} alt="Evoque" className="w-10 h-10 md:w-12 md:h-12" />
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground">Evoque</h2>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">{t("home.title")}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("home.subtitle")}
          </p>
        </div>

        {/* Primary Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12 max-w-4xl mx-auto">
          <Card
            className="group hover:shadow-large transition-all cursor-pointer"
            onClick={() => navigate("/dining/add")}
          >
            <CardContent className="flex items-center space-x-4 p-6">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                <Plus className="h-6 w-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{t("home.addRestaurant")}</h3>
                <p className="text-sm text-muted-foreground">{t("home.addRestaurantDesc")}</p>
              </div>
            </CardContent>
          </Card>

          <Card
            className="group hover:shadow-large transition-all cursor-pointer"
            onClick={() => navigate("/albums/create")}
          >
            <CardContent className="flex items-center space-x-4 p-6">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                <BookImage className="h-6 w-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{t("home.createAlbum")}</h3>
                <p className="text-sm text-muted-foreground">{t("home.createAlbumDesc")}</p>
              </div>
            </CardContent>
          </Card>

          <Card
            className="group hover:shadow-large transition-all cursor-pointer"
            onClick={() => navigate("/dining?tab=albums")}
          >
            <CardContent className="flex items-center space-x-4 p-6">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                <BookImage className="h-6 w-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{t("home.browseAlbums")}</h3>
                <p className="text-sm text-muted-foreground">{t("home.browseAlbumsDesc")}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-large transition-all cursor-pointer" onClick={() => navigate("/dining")}>
            <CardContent className="flex items-center space-x-4 p-6">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                <Search className="h-6 w-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{t("home.search")}</h3>
                <p className="text-sm text-muted-foreground">{t("home.searchDesc")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Popular Tags */}
        {popularTags.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">{t("home.exploreTags")}</h2>
            <div className="flex flex-wrap gap-2">
              {popularTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleTagClick(tag.id)}
                >
                  {tag.label}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Recent Entries */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t("common.loading")}</p>
          </div>
        ) : recentEntries.length > 0 ? (
          <div>
            <h2 className="text-2xl font-semibold mb-4">{t("home.recentExperiences")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentEntries.map((entry) => (
                <Card
                  key={entry.id}
                  className="group hover:shadow-large transition-all cursor-pointer"
                  onClick={() => navigate(`/dining/${entry.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg group-hover:text-accent transition-colors">
                          {entry.restaurant_name}
                        </h3>
                        {entry.location_address && (
                          <p className="text-sm text-muted-foreground mt-1">{entry.location_address}</p>
                        )}
                      </div>
                      {entry.rating && (
                        <div className="flex items-center space-x-1">
                          <span className="text-sm font-medium">{entry.rating}</span>
                          <span className="text-accent">★</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(entry.visit_date).toLocaleDateString(language === "pt" ? "pt-BR" : "en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card className="p-12 text-center">
            <UtensilsCrossed className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">{t("home.noExperiences")}</h3>
            <p className="text-muted-foreground mb-6">
              {t("home.startJourney")}
            </p>
            <Button onClick={() => navigate("/dining/add")}>
              <Plus className="h-4 w-4 mr-2" />
              {t("home.addRestaurant")}
            </Button>
          </Card>
        )}

        {/* Footer */}
        <footer className="mt-16 py-8 text-center border-t border-border">
          <p className="text-sm text-muted-foreground mb-4">{t("home.footer")}</p>
          <a
            href="https://evoque.guru/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent/80 transition-colors font-medium"
          >
            {t("home.learnMore")} evoque.guru →
          </a>
        </footer>
      </main>
    </div>
  );
}
