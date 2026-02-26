import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { type AIConsentScope, setModalRequestSetter } from "@/contexts/AIConsentContext";

export function AIConsentModal() {
  const { t } = useI18n();
  const [modalState, setModalState] = useState<{ scope: AIConsentScope; resolve: (v: boolean) => void } | null>(null);

  useEffect(() => {
    setModalRequestSetter(setModalState);
    return () => setModalRequestSetter(() => {});
  }, []);

  if (!modalState) return null;

  const { scope } = modalState;

  const handleAllow = () => {
    (window as any).__aiConsentHandlers?.handleAllow(scope);
  };

  const handleRefuse = () => {
    (window as any).__aiConsentHandlers?.handleRefuse(scope);
  };

  return (
    <Dialog open={!!modalState} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            {t(`aiConsent.scopes.${scope}.title`)}
          </DialogTitle>
          <DialogDescription className="text-left space-y-3 pt-2">
            <p>{t(`aiConsent.scopes.${scope}.body`)}</p>
            <p className="text-xs text-muted-foreground italic">
              {t("aiConsent.dataOnlySentAfterAllow")}
            </p>
            <a
              href="https://evoque.guru/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline text-sm"
            >
              {t("account.privacyPolicy")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          <Button onClick={handleAllow} className="w-full">
            {t("aiConsent.allowButton")}
          </Button>
          <Button variant="ghost" onClick={handleRefuse} className="w-full">
            {t("aiConsent.notNowButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
