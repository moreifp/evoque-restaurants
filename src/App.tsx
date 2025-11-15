import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Auth } from "./components/Auth";
import Home from "./pages/Home";
import Dining from "./pages/Dining";
import RestaurantDetail from "./pages/RestaurantDetail";
import SharedRestaurant from "./pages/SharedRestaurant";
import SharedByToken from "./pages/SharedByToken";
import TokenInput from "./pages/TokenInput";
import AddRestaurant from "./pages/AddRestaurant";
import AlbumsMap from "./pages/AlbumsMap";
import CreateAlbum from "./pages/CreateAlbum";
import AlbumDetail from "./pages/AlbumDetail";
import UserPublicAlbums from "./pages/UserPublicAlbums";
import WineCellar from "./pages/WineCellar";
import Account from "./pages/Account";
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
            <Route path="/token" element={<TokenInput />} />
            <Route path="/:token" element={<SharedByToken />} />
            
            {/* Redirects for old routes */}
            <Route path="/albums" element={<Navigate to="/dining?tab=albums" replace />} />
            
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
                <Route path="/dining" element={<Dining />} />
                <Route path="/dining/:id" element={<RestaurantDetail />} />
                <Route path="/dining/add" element={<AddRestaurant />} />
                <Route path="/albums/map" element={<AlbumsMap />} />
                <Route path="/albums/create" element={<CreateAlbum />} />
                <Route path="/albums/:id" element={<AlbumDetail />} />
                <Route path="/user/:userId/albums" element={<UserPublicAlbums />} />
                <Route path="/wine-cellar" element={<WineCellar />} />
                <Route path="/account" element={<Account />} />
                <Route path="/planner" element={<RestaurantPlanner />} />
                <Route path="/plans/:id" element={<PlanDetail />} />
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
