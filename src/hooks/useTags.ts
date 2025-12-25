import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tag } from "@/types";

const QUERY_KEY = ["tags"];

async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from("tags").select("*");

  if (error) throw error;
  return data || [];
}

export function useTags() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchTags,
    staleTime: 1000 * 60 * 30, // 30 minutes - tags rarely change
  });
}
