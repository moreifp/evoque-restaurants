import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";

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

export default function Notifications() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
    const channel = supabase
      .channel("notifications_page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "follow_notifications" }, () => {
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
      .limit(100);

    if (data) {
      const actorIds = [...new Set(data.map(n => n.actor_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", actorIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const enriched = data.map(n => ({
        ...n,
        actor: profileMap.get(n.actor_id) || null,
      }));
      setNotifications(enriched as Notification[]);
    }
    setLoading(false);
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
  };

  const markOneRead = async (id: string) => {
    await supabase.from("follow_notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const getNotificationText = (type: string) => {
    switch (type) {
      case "new_follower": return t("notifications.newFollower");
      case "follow_request": return t("notifications.followRequest");
      case "follow_accepted": return t("notifications.followAccepted");
      default: return "";
    }
  };

  const handleClick = (notification: Notification) => {
    if (!notification.read) markOneRead(notification.id);
    if (notification.type === "follow_request") {
      navigate("/social");
    } else {
      navigate(`/user/${notification.actor_id}/albums`);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return t("notifications.yesterday") + " " + format(date, "HH:mm");
    return format(date, "dd/MM/yyyy HH:mm");
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-background pb-20 pt-safe">
      <Navigation />
      <main className="container mx-auto px-4 pt-20 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">{t("notifications.title")}</h1>
            {unreadCount > 0 && (
              <span className="text-sm text-muted-foreground">({unreadCount})</span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
              <Check className="h-4 w-4" />
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <Card
                key={notification.id}
                className={cn(
                  "p-4 cursor-pointer transition-colors hover:bg-accent/5",
                  !notification.read && "border-accent/30 bg-accent/5"
                )}
                onClick={() => handleClick(notification)}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={notification.actor?.avatar_url || ""} />
                    <AvatarFallback>
                      {notification.actor?.display_name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold">{notification.actor?.display_name || "Someone"}</span>
                      {" "}{getNotificationText(notification.type)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(notification.created_at)}
                    </p>
                  </div>
                  {!notification.read && (
                    <div className="h-2.5 w-2.5 rounded-full bg-accent shrink-0" />
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">{t("notifications.noNotifications")}</p>
            <p className="text-sm text-muted-foreground/70 mt-1">{t("notifications.noNotificationsDesc")}</p>
          </div>
        )}
      </main>
    </div>
  );
}
