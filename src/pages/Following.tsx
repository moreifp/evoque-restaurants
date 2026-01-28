import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserPlus, UserMinus, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";

const MIN_SEARCH_LENGTH = 3;

export default function Following() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      fetchFollowing(user.id);
    }
    setLoading(false);
  };

  const fetchFollowing = async (userId: string) => {
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
      .eq("follower_id", userId);

    if (data) {
      setFollowing(data.map(f => f.profiles).filter(Boolean));
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
      const { error } = await supabase
        .from("user_follows")
        .insert({
          follower_id: currentUserId,
          following_id: userId,
        });

      if (error) throw error;

      toast({
        title: t("social.nowFollowing"),
        description: t("social.nowFollowingDesc"),
      });

      if (currentUserId) fetchFollowing(currentUserId);
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

      if (currentUserId) fetchFollowing(currentUserId);
      handleSearch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const isFollowing = (userId: string) => {
    return following.some(f => f.id === userId);
  };

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

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">{t("social.title")}</h1>

          <Tabs defaultValue="search" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="search">
                <Search className="h-4 w-4 mr-2" />
                {t("social.findPeople")}
              </TabsTrigger>
              <TabsTrigger value="following">
                <Users className="h-4 w-4 mr-2" />
                {t("social.following")} ({following.length})
              </TabsTrigger>
            </TabsList>

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
                    <Button 
                      onClick={handleSearch} 
                      disabled={!isSearchEnabled || searching}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {searchQuery.length > 0 && searchQuery.length < MIN_SEARCH_LENGTH && (
                <Card>
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t("social.minCharacters")}
                    </p>
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

              {!searching && searchResults.length > 0 && (
                <div className="space-y-3">
                  {searchResults.map((user) => (
                    <Card key={user.id}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={user.avatar_url} />
                            <AvatarFallback>
                              {user.display_name?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
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
                        {isFollowing(user.id) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnfollow(user.id)}
                          >
                            <UserMinus className="h-4 w-4 mr-2" />
                            {t("social.unfollow")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleFollow(user.id)}
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            {t("social.follow")}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {!searching && searchResults.length === 0 && isSearchEnabled && searchQuery && (
                <Card>
                  <CardContent className="p-12 text-center">
                    <p className="text-muted-foreground">{t("social.noResults")}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="following" className="space-y-3">
              {following.length > 0 ? (
                following.map((user) => (
                  <Card key={user.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={user.avatar_url} />
                          <AvatarFallback>
                            {user.display_name?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnfollow(user.id)}
                      >
                        <UserMinus className="h-4 w-4 mr-2" />
                        {t("social.unfollow")}
                      </Button>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">{t("social.notFollowing")}</h3>
                    <p className="text-muted-foreground">
                      {t("social.notFollowingDesc")}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
