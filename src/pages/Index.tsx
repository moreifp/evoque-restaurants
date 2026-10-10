import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, UtensilsCrossed } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import { useRestaurantEntries } from "@/hooks/useRestaurantEntries";
import { PendingDraftsCard } from "@/components/add/PendingDraftsCard";
import { RestaurantGrid, sortEntries } from "@/components/RestaurantGrid";

export default function Index() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data: allEntries = [], isLoading: loading } = useRestaurantEntries();
  // Todos os restaurantes, mais novos primeiro
  const entries = useMemo(() => sortEntries(allEntries), [allEntries]);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />

      <main className="container mx-auto max-w-5xl px-4 main-content-padding pb-24 md:pb-8">
        <p className="mb-4 text-center text-sm text-muted-foreground">{t("home.tagline")}</p>

        {/* Ação principal */}
        <Button
          type="button"
          onClick={() => navigate("/dining/add")}
          className="mx-auto mb-6 flex h-20 w-full max-w-xl gap-4 rounded-3xl bg-navy text-2xl font-semibold text-white shadow-md hover:bg-navy/90"
        >
          <Plus className="h-9 w-9" />
          {t("home.addRestaurant")}
        </Button>

        {/* Guardados no celular, esperando o Wi-Fi */}
        <PendingDraftsCard />

        {/* Todos os restaurantes */}
        <section className="space-y-3">
          <h2 className="px-1 text-xl font-bold text-[#0d1a2d]">{t("home.culinaryExperience")}</h2>
          {loading ? (
            <p className="py-10 text-center text-muted-foreground">{t("common.loading")}</p>
          ) : entries.length === 0 ? (
            <div className="space-y-4 rounded-3xl border border-[#0d1a2d]/10 bg-background/70 p-8 text-center">
              <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="text-base text-muted-foreground">{t("home.emptyList")}</p>
              <Button
                type="button"
                onClick={() => navigate("/dining/add")}
                className="h-14 gap-2 rounded-2xl bg-navy px-6 text-lg font-semibold text-white hover:bg-navy/90"
              >
                <Plus className="h-6 w-6" />
                {t("home.addRestaurant")}
              </Button>
            </div>
          ) : (
            <RestaurantGrid entries={entries} />
          )}
        </section>
      </main>
    </div>
  );
}
