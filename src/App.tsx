import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Auth } from "./components/Auth";
import Home from "./pages/Home";
import DiningList from "./pages/DiningList";
import RestaurantDetail from "./pages/RestaurantDetail";
import SharedRestaurant from "./pages/SharedRestaurant";
import AddRestaurant from "./pages/AddRestaurant";
import Albums from "./pages/Albums";
import CreateAlbum from "./pages/CreateAlbum";
import AlbumDetail from "./pages/AlbumDetail";
import Following from "./pages/Following";
import UserPublicAlbums from "./pages/UserPublicAlbums";
import WineCellar from "./pages/WineCellar";
import Profile from "./pages/Profile";
import RestaurantPlanner from "./pages/RestaurantPlanner";
import PlanDetail from "./pages/PlanDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/share/:id" element={<SharedRestaurant />} />
            
            {/* Protected routes */}
            {loading ? (
              <Route path="*" element={
                <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-lg bg-gradient-olive-teal mx-auto mb-4 animate-pulse" />
                    <p className="text-muted-foreground">Loading Evoque...</p>
                  </div>
                </div>
              } />
            ) : !session ? (
              <Route path="*" element={<Auth />} />
            ) : (
              <>
                <Route path="/" element={<Home />} />
                <Route path="/dining" element={<DiningList />} />
                <Route path="/dining/:id" element={<RestaurantDetail />} />
                <Route path="/dining/add" element={<AddRestaurant />} />
                <Route path="/albums" element={<Albums />} />
                <Route path="/albums/create" element={<CreateAlbum />} />
                <Route path="/albums/:id" element={<AlbumDetail />} />
                <Route path="/following" element={<Following />} />
                <Route path="/user/:userId/albums" element={<UserPublicAlbums />} />
                <Route path="/wine-cellar" element={<WineCellar />} />
                <Route path="/planner" element={<RestaurantPlanner />} />
                <Route path="/plans/:id" element={<PlanDetail />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="*" element={<NotFound />} />
              </>
            )}
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
