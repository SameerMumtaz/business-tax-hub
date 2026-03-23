import { useState, useEffect, useCallback } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Receipt, Eye, EyeOff, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function AuthPage() {
  const { user, loading: authLoading } = useAuth();
  
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<"password" | "magic_link">(inviteCode ? "magic_link" : "password");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // If invite param is present, default to signup mode
  useEffect(() => {
    if (inviteCode) {
      setIsLogin(false);
      // Persist invite code through email verification redirect
      sessionStorage.setItem("bookie_invite_code", inviteCode);
    }
  }, [inviteCode]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (user) {
    // Preserve invite param through redirect
    const redirectTo = inviteCode ? `/account-type?invite=${encodeURIComponent(inviteCode)}` : "/";
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }

    // Magic link flow
    if (authMode === "magic_link") {
      setSubmitting(true);
      try {
        const redirectTo = inviteCode
          ? `${window.location.origin}/auth?invite=${encodeURIComponent(inviteCode)}`
          : window.location.origin;
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setMagicLinkSent(true);
        toast.success("Check your email for a sign-in link!");
      } catch (err: any) {
        toast.error(err.message || "Failed to send magic link");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Password flow
    if (!password) {
      toast.error("Please enter your password");
      return;
    }
    setSubmitting(true);
    try {
      if (isLogin) {
        const { error, data } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account");
      }
    } catch (err: any) {
      const msg = err.message || "Authentication failed";
      if (!isLogin && (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already been registered"))) {
        toast.error("An account with this email already exists. Try signing in instead, or use 'Forgot password' to reset your password.");
      } else if (!isLogin && msg.toLowerCase().includes("already invited")) {
        toast.error("You've been invited! Check your email for the invite link, or try signing in with your password.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password reset email sent");
    }
  };

  const handleMagicLinkSentReset = useCallback(() => {
    setMagicLinkSent(false);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Receipt className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold tracking-tight">Bookie</span>
          </div>
          <p className="text-muted-foreground text-sm">All-in-One Business & Money Management</p>
        </div>

        {inviteCode && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center space-y-1">
            <p className="text-sm font-medium text-foreground">You've been invited to join a business!</p>
            <p className="text-xs text-muted-foreground">
              Bookie ID: <span className="font-mono font-semibold text-primary">{inviteCode}</span>
            </p>
            <p className="text-xs text-muted-foreground">Create your account below to get started.</p>
          </div>
        )}

        {magicLinkSent ? (
          <div className="space-y-4 text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleMagicLinkSentReset}>
              Try a different email
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Auth mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setAuthMode("magic_link")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                authMode === "magic_link"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              Magic Link
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("password")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                authMode === "password"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Password
            </button>
          </div>

          <div className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {authMode === "password" && (
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? "Please wait…"
              : authMode === "magic_link"
              ? "Send Magic Link"
              : isLogin
              ? "Sign In"
              : "Create Account"}
          </Button>

          {isLogin && authMode === "password" && (
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-xs text-muted-foreground hover:text-primary transition-colors w-full text-center"
            >
              Forgot password?
            </button>
          )}
        </form>
        )}

        {!magicLinkSent && authMode === "password" && (
          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary font-medium hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
