import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import evoqueLogo from "@/assets/evoque-logo.png";

interface TermsAcceptanceGateProps {
  userId: string;
}

export function TermsAcceptanceGate({ userId }: TermsAcceptanceGateProps) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("terms_accepted_at")
        .eq("id", userId)
        .single();

      setAccepted(!!data?.terms_accepted_at);
    };
    check();
  }, [userId]);

  const handleAccept = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ terms_accepted_at: new Date().toISOString() } as any)
      .eq("id", userId);

    if (error) {
      toast({ title: "Error", description: "Could not save. Please try again.", variant: "destructive" });
      setSaving(false);
      return;
    }

    setAccepted(true);
    setSaving(false);
  };

  // Still loading or already accepted — render nothing
  if (accepted === null || accepted) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <img src={evoqueLogo} alt="Evoque" className="w-14 h-14 mx-auto" />

        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">
            We've updated our Terms of Use
          </h1>
          <p className="text-sm text-muted-foreground">
            Before continuing, please review and accept our updated terms. This is required to keep using Evoque.
          </p>
        </div>

        <div className="flex items-start space-x-2 text-left">
          <Checkbox
            id="terms-gate"
            checked={agreed}
            onCheckedChange={(c) => setAgreed(c === true)}
          />
          <label htmlFor="terms-gate" className="text-sm leading-tight cursor-pointer select-none">
            I agree to the{" "}
            <a href="https://evoque.guru/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Terms of Use
            </a>
            {" & "}
            <a href="https://evoque.guru/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              Privacy Policy
            </a>
          </label>
        </div>

        <Button className="w-full" disabled={!agreed || saving} onClick={handleAccept}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
