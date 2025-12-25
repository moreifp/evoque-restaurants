import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useI18n } from "@/i18n/i18n";

const STORAGE_KEY = "ios-install-prompt-dismissed";
const DISMISSAL_DAYS = 7;
const PROMPT_DELAY_MS = 5000;

// Apple Share icon SVG component
const AppleShareIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v12" />
    <path d="M8 7l4-4 4 4" />
    <path d="M5 21h14a2 2 0 002-2v-8a2 2 0 00-2-2h-3" />
    <path d="M5 11a2 2 0 00-2 2v6a2 2 0 002 2" />
  </svg>
);

export function IOSInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const { isIOSSafari, isStandalone } = usePWAInstall();
  const { t } = useI18n();

  useEffect(() => {
    // Don't show if not iOS Safari or already installed
    if (!isIOSSafari || isStandalone) {
      return;
    }

    // Check if previously dismissed
    const dismissedAt = localStorage.getItem(STORAGE_KEY);
    if (dismissedAt) {
      const dismissedDate = new Date(dismissedAt);
      const now = new Date();
      const daysSinceDismissed = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceDismissed < DISMISSAL_DAYS) {
        return;
      }
    }

    // Delay prompt for better UX
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, PROMPT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isIOSSafari, isStandalone]);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-md mx-4 mb-4 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <img 
              src="/app-icon.png" 
              alt="Evoque" 
              className="w-10 h-10 rounded-xl"
            />
            <div>
              <h3 className="font-semibold text-foreground">
                {t("iosInstall.title")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("iosInstall.subtitle")}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Benefits */}
        <div className="px-5 py-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            {t("iosInstall.benefits")}
          </p>
          <ul className="text-sm text-foreground space-y-1.5">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {t("iosInstall.benefit1")}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {t("iosInstall.benefit2")}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {t("iosInstall.benefit3")}
            </li>
          </ul>
        </div>

        {/* Instructions */}
        <div className="mx-5 mb-4 p-4 bg-muted/50 rounded-xl border border-border">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">1</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                {t("iosInstall.step1")}
                <AppleShareIcon className="w-5 h-5 text-primary" />
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 mt-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">2</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {t("iosInstall.step2")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("iosInstall.step2Hint")}
              </p>
            </div>
          </div>
        </div>

        {/* Dismiss button */}
        <div className="px-5 pb-5">
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={handleDismiss}
          >
            {t("iosInstall.maybeLater")}
          </Button>
        </div>
      </div>
    </div>
  );
}
