import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Album } from "@/types";

const QUERY_KEY = ["albums"];

async function fetchAlbums(): Promise<Album[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("albums")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function fetchAlbumById(id: string): Promise<Album | null> {
  const { data, error } = await supabase
    .from("albums")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function deleteAlbum(id: string): Promise<void> {
  const { error } = await supabase.from("albums").delete().eq("id", id);

  if (error) throw error;
}

export function useAlbums() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAlbums,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useAlbum(id: string | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => fetchAlbumById(id!),
    enabled: !!id,
  });
}

export function useDeleteAlbum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAlbum,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
