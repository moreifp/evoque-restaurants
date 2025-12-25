import { useState, useEffect } from "react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const { isStandalone } = usePWAInstall();

  useEffect(() => {
    // Only show splash in standalone mode (installed PWA)
    if (!isStandalone) {
      setVisible(false);
      return;
    }

    // Start fade out after app has loaded
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 800);

    // Remove from DOM after fade animation
    const removeTimer = setTimeout(() => {
      setVisible(false);
    }, 1200);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [isStandalone]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-500">
        <img
          src="/app-icon.png"
          alt="Evoque"
          className="w-24 h-24 rounded-2xl shadow-large"
        />
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Evoque
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Keep the taste alive
          </p>
        </div>
      </div>

      {/* Loading indicator */}
      <div className="absolute bottom-20 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: "0ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: "150ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
