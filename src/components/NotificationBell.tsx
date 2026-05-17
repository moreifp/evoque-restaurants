import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";

interface Notification {
  id: string;
  actor_id: string;
  type: string;
  read: boolean;
  created_at: string;
  actor?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export const NotificationBell = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
    // Set up realtime subscription
    const channel = supabase
      .channel('follow_notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'follow_notifications',
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("follow_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      // Fetch actor profiles
      const actorIds = [...new Set(data.map(n => n.actor_id))];
      const { data: profilesRaw } = await supabase
        .from("public_profiles" as any)
        .select("id, display_name, avatar_url")
        .in("id", actorIds);
      const profiles = (profilesRaw ?? []) as unknown as Array<{ id: string; display_name: string; avatar_url: string }>;

      const profileMap = new Map(profiles.map(p => [p.id, p]));

      const enriched = data.map(n => ({
        ...n,
        actor: profileMap.get(n.actor_id) || null,
      }));

      setNotifications(enriched as unknown as Notification[]);
      setUnreadCount(enriched.filter(n => !n.read).length);
    }
  };

  const markAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("follow_notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const getNotificationText = (type: string) => {
    switch (type) {
      case "new_follower": return t("notifications.newFollower");
      case "follow_request": return t("notifications.followRequest");
      case "follow_accepted": return t("notifications.followAccepted");
      default: return "";
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.type === "follow_request") {
      navigate("/social");
    } else {
      navigate(`/user/${notification.actor_id}/albums`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs flex items-center justify-center"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-background/95 backdrop-blur-lg max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="font-semibold text-sm">{t("notifications.title")}</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-auto py-1" onClick={markAllRead}>
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>
        {notifications.length > 0 ? (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={`flex items-center gap-3 p-3 cursor-pointer ${!notification.read ? 'bg-accent/10' : ''}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={notification.actor?.avatar_url || ""} />
                <AvatarFallback className="text-xs">
                  {notification.actor?.display_name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{notification.actor?.display_name || "Someone"}</span>
                  {" "}{getNotificationText(notification.type)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(notification.created_at).toLocaleDateString()}
                </p>
              </div>
              {!notification.read && (
                <div className="h-2 w-2 rounded-full bg-accent shrink-0" />
              )}
            </DropdownMenuItem>
          ))
        ) : (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("notifications.noNotifications")}</p>
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center cursor-pointer">
          <Link to="/notifications" className="text-sm text-accent font-medium w-full text-center">
            {t("notifications.viewAll")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
