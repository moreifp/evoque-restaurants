import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, BookImage, MoreVertical, Flag, ShieldBan, UserPlus, Clock, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";
import { useBlockedUsersContext } from "@/contexts/BlockedUsersContext";
import { ReportDialog } from "@/components/ReportDialog";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function UserPublicAlbums() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();
  const { blockUser, isBlocked } = useBlockedUsersContext();
  const [user, setUser] = useState<any>(null);
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followStatus, setFollowStatus] = useState<string | null>(null); // null, 'accepted', 'pending'
  const [profileVisibility, setProfileVisibility] = useState<string>("public");

  useEffect(() => {
    if (userId) {
      fetchAll();
    }
  }, [userId]);

  const fetchAll = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    setCurrentUserId(authUser?.id || null);

    // Fetch profile
    const { data: profile } = await supabase
      .from("public_profiles" as any)
      .select("id, display_name, avatar_url, profile_visibility, created_at")
      .eq("id", userId)
      .single();

    setUser(profile);
    setProfileVisibility((profile as any)?.profile_visibility || "public");

    // Check follow status
    if (authUser && userId && authUser.id !== userId) {
      const { data: followData } = await supabase
        .from("user_follows")
        .select("status")
        .eq("follower_id", authUser.id)
        .eq("following_id", userId)
        .maybeSingle();

      setFollowStatus((followData as any)?.status || null);
    }

    // Fetch albums only if allowed
    const canSeeAlbums = !authUser || authUser.id === userId || 
      ((profile as any)?.profile_visibility !== 'private');
    
    if (canSeeAlbums) {
      const { data: albumsData } = await supabase
        .from("albums")
        .select("*")
        .eq("user_id", userId!)
        .eq("visibility", "public")
        .order("created_at", { ascending: false });

      setAlbums(albumsData || []);
    }

    setLoading(false);
  };

  const handleFollow = async () => {
    if (!currentUserId || !userId) return;
    try {
      const { data: visibility } = await supabase.rpc('get_profile_visibility', {
        target_user_id: userId,
      });

      const status = visibility === 'approval_required' ? 'pending' : 'accepted';

      const { error } = await supabase
        .from("user_follows")
        .insert({
          follower_id: currentUserId,
          following_id: userId,
          status,
        } as any);

      if (error) throw error;
      setFollowStatus(status);

      toast({
        title: status === 'pending' ? t("social.requestSent") : t("social.nowFollowing"),
        description: status === 'pending' ? t("social.requestSentDesc") : t("social.nowFollowingDesc"),
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
          <p className="text-center text-muted-foreground">Loading...</p>
        </main>
      </div>
    );
  }

  if (!user || (userId && isBlocked(userId))) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
          <p className="text-center text-muted-foreground">User not found</p>
        </main>
      </div>
    );
  }

  const isOwnProfile = currentUserId === userId;
  const isAcceptedFollower = followStatus === 'accepted';
  const isPending = followStatus === 'pending';
  const isPrivateProfile = profileVisibility === 'private';
  const needsApproval = profileVisibility === 'approval_required';
  const canSeeAlbums = isOwnProfile || isAcceptedFollower || profileVisibility === 'public';

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar_url} />
              <AvatarFallback className="text-2xl">
                {user.display_name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold">{user.display_name || "Anonymous"}</h1>
              <p className="text-muted-foreground">Public Albums</p>
            </div>
          </div>
          
          {currentUserId && currentUserId !== userId && (
            <div className="flex items-center gap-2">
              {/* Follow button */}
              {!isAcceptedFollower && !isPending && !isPrivateProfile && (
                <Button size="sm" onClick={handleFollow}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t("social.follow")}
                </Button>
              )}
              {isPending && (
                <Button variant="secondary" size="sm" disabled>
                  <Clock className="h-4 w-4 mr-2" />
                  {t("social.requested")}
                </Button>
              )}

              {/* Report/Block Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setReportDialogOpen(true)}>
                    <Flag className="h-4 w-4 mr-2" />
                    {t("report.reportUser")}
                  </DropdownMenuItem>
                  {!isBlocked(userId!) && (
                    <DropdownMenuItem onClick={async () => {
                      const success = await blockUser(userId!);
                      if (success) navigate(-1);
                    }}>
                      <ShieldBan className="h-4 w-4 mr-2" />
                      {t("block.blockUser")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Access restricted messages */}
        {!canSeeAlbums && (
          <Card className="p-12 text-center">
            <Lock className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">
              {isPending
                ? t("notifications.requestPending")
                : needsApproval
                  ? t("notifications.followToSeeAlbums")
                  : t("notifications.profilePrivate")}
            </h3>
          </Card>
        )}

        {/* Albums Grid */}
        {canSeeAlbums && (
          albums.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {albums.map((album) => (
                <Card
                  key={album.id}
                  className="group hover:shadow-large transition-all cursor-pointer overflow-hidden"
                  onClick={() => navigate(`/albums/${album.id}`)}
                >
                  {album.cover_image_url ? (
                    <div className="aspect-video bg-muted">
                      <img
                        src={album.cover_image_url}
                        alt={album.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gradient-olive-teal flex items-center justify-center">
                      <BookImage className="h-12 w-12 text-white/80" />
                    </div>
                  )}
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-lg group-hover:text-accent transition-colors mb-2">
                      {album.title}
                    </h3>
                    {album.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{album.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-3">
                      {new Date(album.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <BookImage className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Public Albums</h3>
              <p className="text-muted-foreground">This user hasn't shared any albums yet</p>
            </Card>
          )
        )}

        {/* Report Dialog */}
        <ReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          targetType="user"
          targetId={userId!}
          targetUserId={userId!}
        />
      </main>
    </div>
  );
}
