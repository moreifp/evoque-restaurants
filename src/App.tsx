import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";
import { PWAUpdatePrompt } from "@/components/pwa/PWAUpdatePrompt";
import { IOSInstallPrompt } from "@/components/pwa/IOSInstallPrompt";
import { SplashScreen } from "@/components/pwa/SplashScreen";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { DespiaProvider } from "@/contexts/DespiaContext";
import { BlockedUsersProvider } from "@/contexts/BlockedUsersContext";
import { AIConsentProvider } from "@/contexts/AIConsentContext";
import { Auth } from "./components/Auth";
import { TermsAcceptanceGate } from "./components/TermsAcceptanceGate";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const Dining = lazy(() => import("./pages/Dining"));
const RestaurantDetail = lazy(() => import("./pages/RestaurantDetail"));
const SharedRestaurant = lazy(() => import("./pages/SharedRestaurant"));
const SharedByToken = lazy(() => import("./pages/SharedByToken"));
const TokenInput = lazy(() => import("./pages/TokenInput"));
const AddRestaurant = lazy(() => import("./pages/AddRestaurant"));
const AlbumsMap = lazy(() => import("./pages/AlbumsMap"));
const CreateAlbum = lazy(() => import("./pages/CreateAlbum"));
const AlbumDetail = lazy(() => import("./pages/AlbumDetail"));
const WineCellar = lazy(() => import("./pages/WineCellar"));
const Account = lazy(() => import("./pages/Account"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Admin = lazy(() => import("./pages/Admin"));
const Embed = lazy(() => import("./pages/Embed"));

const isEmbedded = typeof window !== "undefined" && window.self !== window.top;

// Best-effort frame protection: only these sites may embed the app.
const ALLOWED_EMBED_ORIGINS = [
  "https://app.evoque.global",
];
// Endereço de testes do Viagens no Cloudflare.
const isLovableEditor = (o: string) => /^https:\/\/evoque-viagens\.[a-z0-9-]+\.workers\.dev$/.test(o);
function embedBlocked(): boolean {
  if (!isEmbedded) return false;
  const a = (window.location as any).ancestorOrigins as DOMStringList | undefined;
  let chain: string[] = [];
  if (a && a.length) chain = Array.from({ length: a.length }, (_, i) => a.item(i)!);
  else {
    try { if (document.referrer) chain = [new URL(document.referrer).origin]; } catch { /* ignore */ }
  }
  return chain.some((o) => !ALLOWED_EMBED_ORIGINS.includes(o) && !isLovableEditor(o));
}
const blockedFrame = embedBlocked();

// Create QueryClient outside component to prevent re-creation on renders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
      <div className="text-center">
        <div className="w-16 h-16 rounded-lg bg-gradient-olive-teal mx-auto mb-4 animate-pulse" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { session, loading } = useAuthProfile();

  if (loading) {
    return (
      <Routes>
        <Route path="*" element={<LoadingFallback />} />
      </Routes>
    );
  }

  return (
    <AIConsentProvider userId={session?.user?.id ?? null}>
      {session && <TermsAcceptanceGate userId={session.user.id} />}
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public routes - specific routes FIRST */}
          <Route path="/share/:id" element={<SharedRestaurant />} />
          <Route path="/s/:token" element={<SharedByToken />} />
          <Route path="/token" element={<TokenInput />} />
          <Route path="/embed" element={<Embed />} />

          {/* Redirects for old routes */}
          <Route
            path="/albums"
            element={<Navigate to="/dining?tab=albums" replace />}
          />

          {/* Protected routes */}
          {!session ? (
            <>
              {/* Legacy token route - only for unauthenticated users */}
              <Route path="/:token" element={<SharedByToken />} />
              <Route path="*" element={<Auth />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Index />} />
            <Route path="/dining" element={<Dining />} />
            <Route path="/dining/:id" element={<RestaurantDetail />} />
            <Route path="/dining/add" element={<AddRestaurant />} />
            <Route path="/albums/map" element={<AlbumsMap />} />
            <Route path="/albums/create" element={<CreateAlbum />} />
            <Route path="/albums/:id" element={<AlbumDetail />} />
            <Route path="/wine-cellar" element={<WineCellar />} />
            <Route path="/account" element={<Account />} />
            <Route path="/admin" element={<Admin />} />
            {/* Seções removidas (Agenda e Social): links antigos vão para o início */}
            {["/agenda", "/planner", "/plans/:id", "/social", "/notifications", "/user/:userId/albums"].map((p) => (
              <Route key={p} path={p} element={<Navigate to="/" replace />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </>
        )}
      </Routes>
    </Suspense>
    </AIConsentProvider>
  );
}

const App = () => {
  // Initialize standalone mode detection (adds class to body)
  useStandaloneMode();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DespiaProvider>
          <ErrorBoundary>
            {!isEmbedded && <SplashScreen />}
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <BlockedUsersProvider>
                {blockedFrame ? (
                  <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">
                    Evoque Restaurants
                  </div>
                ) : (
                  <AppRoutes />
                )}
              </BlockedUsersProvider>
              {!isEmbedded && (
                <>
                  <PWAInstallPrompt />
                  <IOSInstallPrompt />
                  <PWAUpdatePrompt />
                </>
              )}
            </BrowserRouter>
          </ErrorBoundary>
        </DespiaProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
