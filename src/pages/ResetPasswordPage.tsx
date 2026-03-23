import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase auto-exchanges tokens from the URL hash via onAuthStateChange.
    // We just need to wait for a valid session before showing the form.
    // Give a short delay for the token exchange to complete.
    const timeout = setTimeout(() => {
      setReady(true);
    }, 1500);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (ready && !user) {
      toast.error("Invalid or expired reset link. Please request a new one.");
      navigate("/auth");
    }
  }, [ready, user, navigate]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated! Redirecting…");
      setTimeout(() => navigate("/"), 1500);
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-muted-foreground">Verifying link…</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Receipt className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold tracking-tight">Bookie</span>
          </div>
          <p className="text-muted-foreground text-sm">Set your account password</p>
        </div>
        <form onSubmit={handleReset} className="space-y-4">
          <Input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating…" : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
