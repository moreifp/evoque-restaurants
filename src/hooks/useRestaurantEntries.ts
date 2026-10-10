import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cleanupInboxForEntry } from "@/lib/photoStorage";
import type { RestaurantEntry } from "@/types";
import { removeEntryFromCache } from "@/lib/entryCache";

const QUERY_KEY = ["restaurant-entries"];

async function fetchEntries(): Promise<RestaurantEntry[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("restaurant_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("visit_date", { ascending: false });


  if (error) throw error;
  return data || [];
}

async function fetchEntryById(id: string): Promise<RestaurantEntry | null> {
  const { data, error } = await supabase
    .from("restaurant_entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function deleteEntry(id: string): Promise<void> {
  await cleanupInboxForEntry(id);
  const { error } = await supabase
    .from("restaurant_entries")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export function useRestaurantEntries() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchEntries,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useRestaurantEntry(id: string | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => fetchEntryById(id!),
    enabled: !!id,
  });
}

export function useDeleteRestaurantEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteEntry,
    onSuccess: (_data, id) => removeEntryFromCache(queryClient, id),
  });
}
