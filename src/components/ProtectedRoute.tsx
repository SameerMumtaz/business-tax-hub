import { ReactNode, useEffect, useState, createContext, useContext, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface ProfileGateContextType {
  profileComplete: boolean | null;
  recheckProfile: () => void;
}

const ProfileGateContext = createContext<ProfileGateContextType>({
  profileComplete: null,
  recheckProfile: () => {},
});

export const useProfileGate = () => useContext(ProfileGateContext);

export function ProfileGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  const recheckProfile = useCallback(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("business_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setProfileComplete(!!data?.business_name?.trim());
      });
  }, [user]);

  useEffect(() => {
    if (user) {
      recheckProfile();
    } else {
      setProfileComplete(null);
    }
  }, [user, recheckProfile]);

  return (
    <ProfileGateContext.Provider value={{ profileComplete, recheckProfile }}>
      {children}
    </ProfileGateContext.Provider>
  );
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { profileComplete } = useProfileGate();
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

  if (!profileComplete && location.pathname !== "/profile") {
    return <Navigate to="/profile" replace />;
  }

  return <>{children}</>;
}
