import type { QueryClient } from "@tanstack/react-query";
import type { RestaurantEntry } from "@/types";

/** Listas que mostram restaurantes: entradas, capas (miniaturas) e chips de viagem. */
export function refreshRestaurantLists(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["restaurant-entries"] });
  void qc.invalidateQueries({ queryKey: ["entry-covers"] });
  void qc.invalidateQueries({ queryKey: ["album-groups"] });
}

/** Restaurante apagado: some da lista na hora e as listas são recarregadas. */
export function removeEntryFromCache(qc: QueryClient, id: string): void {
  qc.setQueryData<RestaurantEntry[]>(["restaurant-entries"], (old) => old?.filter((e) => e.id !== id));
  qc.removeQueries({ queryKey: ["restaurant-entries", id], exact: true });
  refreshRestaurantLists(qc);
}
