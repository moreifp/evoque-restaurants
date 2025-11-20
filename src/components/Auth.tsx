import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import evoqueLogo from "@/assets/evoque-logo.svg";
import { z } from "zod";

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const signUpSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  displayName: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z\s-']+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes')
});

const signInSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z.string().min(1, 'Password is required')
});

export const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const { toast } = useToast();
  const { t } = useI18n();

  // Validate password in real-time for sign up
  const validatePassword = (pwd: string) => {
    if (!isSignUp) return;
    
    const errors: string[] = [];
    if (pwd.length > 0 && pwd.length < 8) errors.push("At least 8 characters");
    if (pwd.length > 0 && !/[A-Z]/.test(pwd)) errors.push("One uppercase letter");
    if (pwd.length > 0 && !/[a-z]/.test(pwd)) errors.push("One lowercase letter");
    if (pwd.length > 0 && !/[0-9]/.test(pwd)) errors.push("One number");
    
    setPasswordErrors(errors);
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Error",
        description: t("auth.googleAuthError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isForgotPassword) {
        // Password reset flow
        const validation = z.string().email('Invalid email address').safeParse(email);
        if (!validation.success) {
          toast({
            title: t("auth.invalidCredentials"),
            description: validation.error.errors[0].message,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        });

        if (error) throw error;

        toast({
          title: t("auth.resetEmailSent"),
          description: t("auth.resetEmailSent"),
        });
        setIsForgotPassword(false);
        setEmail("");
      } else if (isSignUp) {
        const validation = signUpSchema.safeParse({ email, password, displayName });
        if (!validation.success) {
          const errors = validation.error.errors.map(err => err.message).join('. ');
          toast({
            title: "Validation Error",
            description: errors,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) throw error;

        if (data.user) {
          // Create profile
          await supabase.from("profiles").insert({
            id: data.user.id,
            display_name: displayName,
          });

          toast({
            title: t("auth.signUpSuccess"),
            description: t("auth.signUpSuccess"),
          });
        }
      } else {
        const validation = signInSchema.safeParse({ email, password });
        if (!validation.success) {
          const errors = validation.error.errors.map(err => err.message).join('. ');
          toast({
            title: "Validation Error",
            description: errors,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast({
          title: t("auth.signInSuccess"),
          description: t("auth.signInSuccess"),
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
      // Only log errors in development
      if (import.meta.env.DEV) {
        console.error("Auth error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle px-4">
      <Card className="w-full max-w-md shadow-large">
        <CardHeader className="space-y-1">
          <div className="flex items-center space-x-2 mb-4">
            <img src={evoqueLogo} alt="Evoque" className="w-10 h-10" />
            <CardTitle className="text-2xl">Evoque by Fausto</CardTitle>
          </div>
          <CardDescription>
            {isForgotPassword
              ? t("auth.resetPassword")
              : isSignUp
              ? t("auth.createAccount")
              : t("auth.signIn")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isForgotPassword && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <GoogleIcon />
                {isSignUp ? t("auth.signUpWithGoogle") : t("auth.signInWithGoogle")}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t("auth.orContinueWith")}
                  </span>
                </div>
              </div>
            </>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && !isForgotPassword && (
              <div className="space-y-2">
                <Label htmlFor="displayName">{t("auth.displayName")}</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder={t("account.displayNamePlaceholder")}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required={isSignUp}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {!isForgotPassword && (
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  validatePassword(e.target.value);
                }}
                required
              />
              {isSignUp && (
                <div className="text-sm space-y-1 mt-2">
                  <p className="text-muted-foreground font-medium">{t("auth.passwordRequirements")}</p>
                  <ul className="space-y-1">
                    <li className={cn(
                      "flex items-center gap-2",
                      password.length >= 8 ? "text-green-600" : passwordErrors.includes("At least 8 characters") ? "text-destructive" : "text-muted-foreground"
                    )}>
                      <span className="text-xs">{password.length >= 8 ? "✓" : "○"}</span>
                      At least 8 characters
                    </li>
                    <li className={cn(
                      "flex items-center gap-2",
                      /[A-Z]/.test(password) ? "text-green-600" : passwordErrors.includes("One uppercase letter") ? "text-destructive" : "text-muted-foreground"
                    )}>
                      <span className="text-xs">{/[A-Z]/.test(password) ? "✓" : "○"}</span>
                      One uppercase letter
                    </li>
                    <li className={cn(
                      "flex items-center gap-2",
                      /[a-z]/.test(password) ? "text-green-600" : passwordErrors.includes("One lowercase letter") ? "text-destructive" : "text-muted-foreground"
                    )}>
                      <span className="text-xs">{/[a-z]/.test(password) ? "✓" : "○"}</span>
                      One lowercase letter
                    </li>
                    <li className={cn(
                      "flex items-center gap-2",
                      /[0-9]/.test(password) ? "text-green-600" : passwordErrors.includes("One number") ? "text-destructive" : "text-muted-foreground"
                    )}>
                      <span className="text-xs">{/[0-9]/.test(password) ? "✓" : "○"}</span>
                      One number
                    </li>
                  </ul>
                </div>
              )}
            </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? t("common.loading") : isForgotPassword ? t("auth.sendResetLink") : isSignUp ? t("auth.createAccount") : t("auth.signIn")}
            </Button>
          </form>
          {!isSignUp && !isForgotPassword && (
            <div className="mt-4 text-center text-sm">
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="text-accent hover:underline"
              >
                {t("auth.forgotPassword")}
              </button>
            </div>
          )}
          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setIsForgotPassword(false);
              }}
              className="text-accent hover:underline"
            >
              {isForgotPassword
                ? t("auth.backToSignIn")
                : isSignUp
                ? t("auth.alreadyHaveAccount")
                : t("auth.dontHaveAccount")}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
