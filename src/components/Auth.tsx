import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import evoqueLogo from "@/assets/evoque-logo.svg";
import { z } from "zod";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isForgotPassword) {
        // Password reset flow
        const validation = z.string().email('Invalid email address').safeParse(email);
        if (!validation.success) {
          toast({
            title: "Validation Error",
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
          title: "Check your email",
          description: "We've sent you a password reset link",
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
            title: "Account created!",
            description: "Welcome to Evoque",
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
          title: "Welcome back!",
          description: "You've signed in successfully",
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
              ? "Enter your email to receive a password reset link"
              : isSignUp
              ? "Create an account to start preserving your culinary memories"
              : "Sign in to access your dining diary"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && !isForgotPassword && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required={isSignUp}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="password">Password</Label>
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
                  <p className="text-muted-foreground font-medium">Password must contain:</p>
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
              {loading ? "Loading..." : isForgotPassword ? "Send Reset Link" : isSignUp ? "Create Account" : "Sign In"}
            </Button>
          </form>
          {!isSignUp && !isForgotPassword && (
            <div className="mt-4 text-center text-sm">
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="text-accent hover:underline"
              >
                Forgot password?
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
                ? "Back to sign in"
                : isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
