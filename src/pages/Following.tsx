import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPlus, UserMinus, Search, Users, MoreVertical, Flag, ShieldBan, Clock, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { useBlockedUsersContext } from "@/contexts/BlockedUsersContext";
import { ReportDialog } from "@/components/ReportDialog";

const MIN_SEARCH_LENGTH = 3;

export default function Following() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();
  const { blockedIds, blockUser, isBlocked } = useBlockedUsersContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [pendingFollows, setPendingFollows] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportTargetUserId, setReportTargetUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      fetchFollowing(user.id);
      fetchPendingFollows(user.id);
      fetchIncomingRequests(user.id);
    }
    setLoading(false);
  };

  const fetchFollowing = async (userId: string) => {
    const { data } = await supabase
      .from("user_follows")
      .select(`
        following_id,
        status,
        profiles!user_follows_following_id_fkey (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq("follower_id", userId)
      .eq("status", "accepted");

    if (data) {
      setFollowing(data.map(f => f.profiles).filter(Boolean));
    }
  };

  const fetchPendingFollows = async (userId: string) => {
    const { data } = await supabase
      .from("user_follows")
      .select(`
        following_id,
        profiles!user_follows_following_id_fkey (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq("follower_id", userId)
      .eq("status", "pending");

    if (data) {
      setPendingFollows(data.map(f => f.profiles).filter(Boolean));
    }
  };

  const fetchIncomingRequests = async (userId: string) => {
    const { data } = await supabase
      .from("user_follows")
      .select(`
        id,
        follower_id,
        profiles!user_follows_follower_id_fkey (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq("following_id", userId)
      .eq("status", "pending");

    if (data) {
      setIncomingRequests(data.map(f => ({
        followId: f.id,
        ...f.profiles,
      })).filter(Boolean));
    }
  };

  const handleSearch = async () => {
    if (searchQuery.trim().length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      return;
    }

    if (!currentUserId) return;

    setSearching(true);
    try {
      const { data, error } = await supabase.rpc('search_users_fuzzy', {
        search_term: searchQuery.trim(),
        exclude_user_id: currentUserId,
        max_results: 10
      });

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleFollow = async (userId: string) => {
    try {
      // Check target's profile visibility
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

      if (status === 'pending') {
        toast({
          title: t("social.requestSent"),
          description: t("social.requestSentDesc"),
        });
        if (currentUserId) fetchPendingFollows(currentUserId);
      } else {
        toast({
          title: t("social.nowFollowing"),
          description: t("social.nowFollowingDesc"),
        });
        if (currentUserId) fetchFollowing(currentUserId);
      }
      handleSearch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUnfollow = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", userId);

      if (error) throw error;

      toast({
        title: t("social.unfollowed"),
        description: t("social.unfollowedDesc"),
      });

      if (currentUserId) {
        fetchFollowing(currentUserId);
        fetchPendingFollows(currentUserId);
      }
      handleSearch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAcceptRequest = async (followId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from("user_follows")
        .update({ status: "accepted" } as any)
        .eq("id", followId);

      if (error) throw error;

      toast({
        title: t("social.requestAccepted"),
        description: t("social.requestAcceptedDesc"),
      });

      setIncomingRequests(prev => prev.filter(r => r.followId !== followId));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleRejectRequest = async (followId: string) => {
    try {
      const { error } = await supabase
        .from("user_follows")
        .delete()
        .eq("id", followId);

      if (error) throw error;

      toast({
        title: t("social.requestRejected"),
        description: t("social.requestRejectedDesc"),
      });

      setIncomingRequests(prev => prev.filter(r => r.followId !== followId));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBlockUser = async (userId: string) => {
    const success = await blockUser(userId);
    if (success) {
      setSearchResults(prev => prev.filter(u => u.id !== userId));
      setFollowing(prev => prev.filter(u => u.id !== userId));
      setIncomingRequests(prev => prev.filter(u => u.id !== userId));
    }
  };

  const handleReportUser = (userId: string) => {
    setReportTargetUserId(userId);
    setReportDialogOpen(true);
  };

  const isFollowingUser = (userId: string) => {
    return following.some(f => f.id === userId);
  };

  const isPendingUser = (userId: string) => {
    return pendingFollows.some(f => f.id === userId);
  };

  // Filter blocked users
  const filteredSearchResults = searchResults.filter(u => !blockedIds.has(u.id));
  const filteredFollowing = following.filter(u => !blockedIds.has(u.id));
  const filteredRequests = incomingRequests.filter(u => !blockedIds.has(u.id));

  const isSearchEnabled = searchQuery.trim().length >= MIN_SEARCH_LENGTH;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
          <p className="text-center text-muted-foreground">{t("common.loading")}</p>
        </main>
      </div>
    );
  }

  const getFollowButton = (userId: string) => {
    if (isFollowingUser(userId)) {
      return (
        <Button variant="outline" size="sm" onClick={() => handleUnfollow(userId)}>
          <UserMinus className="h-4 w-4 mr-2" />
          {t("social.unfollow")}
        </Button>
      );
    }
    if (isPendingUser(userId)) {
      return (
        <Button variant="secondary" size="sm" disabled>
          <Clock className="h-4 w-4 mr-2" />
          {t("social.requested")}
        </Button>
      );
    }
    return (
      <Button size="sm" onClick={() => handleFollow(userId)}>
        <UserPlus className="h-4 w-4 mr-2" />
        {t("social.follow")}
      </Button>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">{t("social.title")}</h1>

          <Tabs defaultValue="search" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="search">
                <Search className="h-4 w-4 mr-2" />
                {t("social.findPeople")}
              </TabsTrigger>
              <TabsTrigger value="following">
                <Users className="h-4 w-4 mr-2" />
                {t("social.following")} ({filteredFollowing.length})
              </TabsTrigger>
              <TabsTrigger value="requests" className="relative">
                <Clock className="h-4 w-4 mr-2" />
                {t("social.requests")}
                {filteredRequests.length > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1 text-xs">
                    {filteredRequests.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Search Tab */}
            <TabsContent value="search" className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("social.searchPlaceholder")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && isSearchEnabled && handleSearch()}
                    />
                    <Button onClick={handleSearch} disabled={!isSearchEnabled || searching}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {searchQuery.length > 0 && searchQuery.length < MIN_SEARCH_LENGTH && (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground">{t("social.minCharacters")}</p>
                  </CardContent>
                </Card>
              )}

              {searching && (
                <Card>
                  <CardContent className="p-12 text-center">
                    <p className="text-muted-foreground">{t("common.loading")}</p>
                  </CardContent>
                </Card>
              )}

              {!searching && filteredSearchResults.length > 0 && (
                <div className="space-y-3">
                  {filteredSearchResults.map((user) => (
                    <Card key={user.id}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={user.avatar_url} />
                            <AvatarFallback>{user.display_name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.display_name || "Anonymous"}</p>
                            <Button
                              variant="link"
                              className="h-auto p-0 text-sm text-muted-foreground"
                              onClick={() => navigate(`/user/${user.id}/albums`)}
                            >
                              {t("social.viewPublicAlbums")}
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {getFollowButton(user.id)}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleReportUser(user.id)}>
                                <Flag className="h-4 w-4 mr-2" />
                                {t("report.reportUser")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleBlockUser(user.id)}>
                                <ShieldBan className="h-4 w-4 mr-2" />
                                {t("block.blockUser")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {!searching && filteredSearchResults.length === 0 && isSearchEnabled && searchQuery && (
                <Card>
                  <CardContent className="p-12 text-center">
                    <p className="text-muted-foreground">{t("social.noResults")}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Following Tab */}
            <TabsContent value="following" className="space-y-3">
              {filteredFollowing.length > 0 ? (
                filteredFollowing.map((user) => (
                  <Card key={user.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={user.avatar_url} />
                          <AvatarFallback>{user.display_name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.display_name || "Anonymous"}</p>
                          <Button
                            variant="link"
                            className="h-auto p-0 text-sm text-muted-foreground"
                            onClick={() => navigate(`/user/${user.id}/albums`)}
                          >
                            {t("social.viewPublicAlbums")}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => handleUnfollow(user.id)}>
                          <UserMinus className="h-4 w-4 mr-2" />
                          {t("social.unfollow")}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleReportUser(user.id)}>
                              <Flag className="h-4 w-4 mr-2" />
                              {t("report.reportUser")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBlockUser(user.id)}>
                              <ShieldBan className="h-4 w-4 mr-2" />
                              {t("block.blockUser")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">{t("social.notFollowing")}</h3>
                    <p className="text-muted-foreground">{t("social.notFollowingDesc")}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Requests Tab */}
            <TabsContent value="requests" className="space-y-3">
              {filteredRequests.length > 0 ? (
                filteredRequests.map((request) => (
                  <Card key={request.followId}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={request.avatar_url} />
                          <AvatarFallback>{request.display_name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{request.display_name || "Anonymous"}</p>
                          <p className="text-sm text-muted-foreground">{t("social.wantsToFollow")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => handleAcceptRequest(request.followId, request.id)}>
                          <Check className="h-4 w-4 mr-1" />
                          {t("social.acceptRequest")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleRejectRequest(request.followId)}>
                          <X className="h-4 w-4 mr-1" />
                          {t("social.rejectRequest")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Clock className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">{t("social.noRequests")}</h3>
                    <p className="text-muted-foreground">{t("social.noRequestsDesc")}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Report Dialog */}
      {reportTargetUserId && (
        <ReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          targetType="user"
          targetId={reportTargetUserId}
          targetUserId={reportTargetUserId}
        />
      )}
    </div>
  );
}
