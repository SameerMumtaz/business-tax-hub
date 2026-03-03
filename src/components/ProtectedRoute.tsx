import { ReactNode, useEffect, useState, createContext, useContext, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface ProfileGateContextType {
  profileComplete: boolean | null;
  accountType: string | null;
  recheckProfile: () => void;
}

const ProfileGateContext = createContext<ProfileGateContextType>({
  profileComplete: null,
  accountType: null,
  recheckProfile: () => {},
});

export const useProfileGate = () => useContext(ProfileGateContext);

export function ProfileGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [accountType, setAccountType] = useState<string | null>(null);

  const recheckProfile = useCallback(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("business_name, account_type")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        const raw = data as any;
        setAccountType(raw?.account_type ?? null);
        if (raw?.account_type === "individual") {
          // Individual users don't need business_name
          setProfileComplete(true);
        } else {
          setProfileComplete(!!raw?.business_name?.trim());
        }
      });
  }, [user]);

  useEffect(() => {
    if (user) {
      recheckProfile();
    } else {
      setProfileComplete(null);
      setAccountType(null);
    }
  }, [user, recheckProfile]);

  return (
    <ProfileGateContext.Provider value={{ profileComplete, accountType, recheckProfile }}>
      {children}
    </ProfileGateContext.Provider>
  );
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { profileComplete, accountType } = useProfileGate();
  const location = useLocation();

  if (loading || (user && profileComplete === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // No account type chosen yet → send to selection
  if (!accountType && location.pathname !== "/account-type") {
    return <Navigate to="/account-type" replace />;
  }

  // Business users need profile completion
  if (accountType === "business" && !profileComplete && location.pathname !== "/profile") {
    return <Navigate to="/profile" replace />;
  }

  // Prevent business users from accessing personal routes and vice versa
  if (accountType === "business" && location.pathname.startsWith("/personal")) {
    return <Navigate to="/" replace />;
  }
  if (accountType === "individual" && !location.pathname.startsWith("/personal") && location.pathname !== "/account-type") {
    return <Navigate to="/personal" replace />;
  }

  return <>{children}</>;
}
