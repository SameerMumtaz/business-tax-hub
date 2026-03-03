import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TeamRoleInfo {
  role: "admin" | "manager" | "crew" | null;
  businessUserId: string | null;
  teamMemberId: string | null;
  isTeamMember: boolean;
  loading: boolean;
  refetch: () => void;
}

export function useTeamRole(): TeamRoleInfo {
  const { user } = useAuth();
  const [role, setRole] = useState<"admin" | "manager" | "crew" | null>(null);
  const [businessUserId, setBusinessUserId] = useState<string | null>(null);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async () => {
    if (!user) {
      setRole(null);
      setBusinessUserId(null);
      setTeamMemberId(null);
      setLoading(false);
      return;
    }

    // Check if this user is a team member of any business
    const { data } = await supabase
      .from("team_members")
      .select("id, role, business_user_id, status")
      .eq("member_user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (data) {
      setRole(data.role as "admin" | "manager" | "crew");
      setBusinessUserId(data.business_user_id);
      setTeamMemberId(data.id);
    } else {
      // Check if the user is a business owner (admin by default)
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("user_id", user.id)
        .single();

      if (profile?.account_type === "business") {
        setRole("admin");
        setBusinessUserId(user.id);
        setTeamMemberId(null);
      } else {
        setRole(null);
        setBusinessUserId(null);
        setTeamMemberId(null);
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  return {
    role,
    businessUserId,
    teamMemberId,
    isTeamMember: !!role && role !== "admin",
    loading,
    refetch: fetchRole,
  };
}
