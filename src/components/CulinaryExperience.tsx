import { useMemo } from "react";
import { UtensilsCrossed } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { useRestaurantEntries } from "@/hooks/useRestaurantEntries";
import { RestaurantGrid, sortEntries } from "@/components/RestaurantGrid";

/** "Culinary Experience": todos os restaurantes, mais novos primeiro (início). */
export function CulinaryExperience() {
  const { t } = useI18n();
  const { data: allEntries = [], isLoading } = useRestaurantEntries();
  const entries = useMemo(() => sortEntries(allEntries), [allEntries]);
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-xl font-bold text-[#0d1a2d]">{t("home.culinaryExperience")}</h2>
      {isLoading ? (
        <p className="py-10 text-center text-muted-foreground">{t("common.loading")}</p>
      ) : entries.length === 0 ? (
        <div className="space-y-3 rounded-3xl border border-[#0d1a2d]/10 bg-background/70 p-8 text-center">
          <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="text-base text-muted-foreground">{t("home.emptyList")}</p>
        </div>
      ) : (
        <RestaurantGrid entries={entries} />
      )}
    </section>
  );
}
