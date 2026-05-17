import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";

interface BlockedUser {
  id: string;
  blocked_id: string;
  created_at: string;
  profile?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useBlockedUsers() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchBlockedUsers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_blocks")
        .select("id, blocked_id, created_at")
        .eq("blocker_id", user.id);

      if (error) throw error;

      // Fetch profiles for blocked users
      if (data && data.length > 0) {
        const blockedUserIds = data.map((b) => b.blocked_id);
        const { data: profilesRaw } = await supabase
          .from("public_profiles" as any)
          .select("id, display_name, avatar_url")
          .in("id", blockedUserIds);
        const profiles = (profilesRaw ?? []) as Array<{ id: string; display_name: string; avatar_url: string }>;

        const enrichedData = data.map((block) => ({
          ...block,
          profile: profiles.find((p) => p.id === block.blocked_id),
        })) as BlockedUser[];

        setBlockedUsers(enrichedData);
        setBlockedIds(new Set(blockedUserIds));
      } else {
        setBlockedUsers([]);
        setBlockedIds(new Set());
      }
    } catch (error) {
      console.error("Error fetching blocked users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockedUsers();
  }, []);

  const blockUser = async (userId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("user_blocks").insert({
        blocker_id: user.id,
        blocked_id: userId,
      });

      if (error) throw error;

      // Auto-create content report via edge function for developer notification
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-content-report`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              target_type: "user",
              target_id: userId,
              target_user_id: userId,
              reason: "blocked",
              details: "User was blocked by another user",
            }),
          });
        }
      } catch (reportErr) {
        console.error("Error sending block report:", reportErr);
      }

      // Auto-unfollow the blocked user (both directions)
      await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", userId);

      await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", userId)
        .eq("following_id", user.id);

      toast({
        title: t("block.blocked"),
        description: t("block.blockedDesc"),
      });

      await fetchBlockedUsers();
      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  const unblockUser = async (userId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", userId);

      if (error) throw error;

      toast({
        title: t("block.unblocked"),
        description: t("block.unblockedDesc"),
      });

      await fetchBlockedUsers();
      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  const isBlocked = (userId: string) => blockedIds.has(userId);

  return {
    blockedUsers,
    blockedIds,
    loading,
    blockUser,
    unblockUser,
    isBlocked,
    refetch: fetchBlockedUsers,
  };
}
