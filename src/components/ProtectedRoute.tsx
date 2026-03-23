import { ReactNode, useEffect, useState, createContext, useContext, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface ProfileGateContextType {
  profileComplete: boolean | null;
  accountType: string | null;
  teamRole: "admin" | "manager" | "crew" | null;
  businessUserId: string | null;
  teamMemberId: string | null;
  recheckProfile: () => void;
}

const ProfileGateContext = createContext<ProfileGateContextType>({
  profileComplete: null,
  accountType: null,
  teamRole: null,
  businessUserId: null,
  teamMemberId: null,
  recheckProfile: () => {},
});

export const useProfileGate = () => useContext(ProfileGateContext);

export function ProfileGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [teamRole, setTeamRole] = useState<"admin" | "manager" | "crew" | null>(null);
  const [businessUserId, setBusinessUserId] = useState<string | null>(null);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);

  const recheckProfile = useCallback(() => {
    if (!user) return;

    // Check team membership first
    supabase
      .from("team_members")
      .select("id, role, business_user_id, status")
      .eq("member_user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
      .then(({ data: teamData }) => {
        if (teamData) {
          setTeamRole(teamData.role as "admin" | "manager" | "crew");
          setBusinessUserId(teamData.business_user_id);
          setTeamMemberId(teamData.id);
          setAccountType("business");
          setProfileComplete(true);
          return;
        }

        // Not a team member — check profile
        setTeamRole(null);
        setBusinessUserId(user.id);
        setTeamMemberId(null);

        supabase
          .from("profiles")
          .select("business_name, account_type")
          .eq("user_id", user.id)
          .single()
          .then(({ data }) => {
            const raw = data as any;
            const acctType = raw?.account_type ?? null;
            setAccountType(acctType);

            if (acctType === "business") {
              setTeamRole("admin"); // business owner is admin
              setProfileComplete(!!raw?.business_name?.trim());
            } else if (acctType === "individual") {
              setProfileComplete(true);
            } else {
              setProfileComplete(false);
            }
          });
      });
  }, [user]);

  useEffect(() => {
    if (user) {
      recheckProfile();
    } else {
      setProfileComplete(null);
      setAccountType(null);
      setTeamRole(null);
      setBusinessUserId(null);
      setTeamMemberId(null);
    }
  }, [user, recheckProfile]);

  return (
    <ProfileGateContext.Provider
      value={{ profileComplete, accountType, teamRole, businessUserId, teamMemberId, recheckProfile }}
    >
      {children}
    </ProfileGateContext.Provider>
  );
}

// Manager-allowed routes
const managerRoutes = ["/invoices", "/jobs", "/timesheets", "/team", "/crew-map", "/clients"];
// Crew-allowed routes
const crewRoutes = ["/crew"];

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { profileComplete, accountType, teamRole } = useProfileGate();
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

  // No account type chosen yet → send to selection (unless team member)
  if (!accountType && location.pathname !== "/account-type") {
    // Preserve invite query param so AccountTypePage can auto-fill Bookie ID
    const inviteParam = new URLSearchParams(location.search).get("invite");
    const storedInvite = sessionStorage.getItem("bookie_invite_code");
    const invite = inviteParam || storedInvite;
    const accountTypeUrl = invite
      ? `/account-type?invite=${encodeURIComponent(invite)}`
      : "/account-type";
    return <Navigate to={accountTypeUrl} replace />;
  }

  // Business users need profile completion (admin only)
  if (
    accountType === "business" &&
    teamRole === "admin" &&
    !profileComplete &&
    location.pathname !== "/profile"
  ) {
    return <Navigate to="/profile" replace />;
  }

  // Crew members can only access crew routes
  if (teamRole === "crew") {
    if (!crewRoutes.some((r) => location.pathname.startsWith(r))) {
      return <Navigate to="/crew" replace />;
    }
  }

  // Manager members can only access manager routes
  if (teamRole === "manager") {
    const allowed = managerRoutes.some((r) => location.pathname.startsWith(r));
    if (!allowed && location.pathname !== "/") {
      return <Navigate to="/invoices" replace />;
    }
  }

  // Prevent business users from accessing personal routes and vice versa
  if (accountType === "business" && location.pathname.startsWith("/personal")) {
    return <Navigate to="/" replace />;
  }
  if (
    accountType === "individual" &&
    !location.pathname.startsWith("/personal") &&
    location.pathname !== "/account-type"
  ) {
    return <Navigate to="/personal" replace />;
  }

  return <>{children}</>;
}
