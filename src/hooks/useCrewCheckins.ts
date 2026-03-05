import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeamRole } from "./useTeamRole";
import { toast } from "sonner";

export interface CrewCheckin {
  id: string;
  team_member_id: string;
  job_id: string | null;
  job_site_id: string | null;
  check_in_time: string;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_time: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  total_hours: number;
  status: string;
  notes: string | null;
  created_at: string;
}

export function useCrewCheckins() {
  const { teamMemberId, businessUserId, role } = useTeamRole();
  const [checkins, setCheckins] = useState<CrewCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCheckin, setActiveCheckin] = useState<CrewCheckin | null>(null);

  const fetchCheckins = useCallback(async () => {
    if (!teamMemberId && role !== "admin" && role !== "manager") {
      setLoading(false);
      return;
    }

    let query = supabase
      .from("crew_checkins")
      .select("*")
      .order("check_in_time", { ascending: false });

    // Crew members only see their own
    if (role === "crew" && teamMemberId) {
      query = query.eq("team_member_id", teamMemberId);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load check-ins");
    } else {
      const items = (data || []) as CrewCheckin[];
      setCheckins(items);
      // Find active check-in for this crew member
      if (teamMemberId) {
        setActiveCheckin(
          items.find(
            (c) =>
              c.team_member_id === teamMemberId && c.status === "checked_in"
          ) || null
        );
      }
    }
    setLoading(false);
  }, [teamMemberId, role]);

  useEffect(() => {
    fetchCheckins();
  }, [fetchCheckins]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("crew_checkins_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crew_checkins" },
        () => fetchCheckins()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCheckins]);

  const checkIn = async (
    jobId: string,
    jobSiteId: string,
    lat: number,
    lng: number
  ) => {
    if (!teamMemberId) {
      toast.error("Team member not found");
      return null;
    }

    const { data, error } = await supabase
      .from("crew_checkins")
      .insert({
        team_member_id: teamMemberId,
        job_id: jobId,
        job_site_id: jobSiteId,
        check_in_lat: lat,
        check_in_lng: lng,
        status: "checked_in",
      })
      .select()
      .single();

    if (error) {
      toast.error("Check-in failed: " + error.message);
      return null;
    }

    toast.success("Checked in successfully!");
    setActiveCheckin(data as CrewCheckin);
    return data;
  };

  const checkOut = async (checkinId: string, lat: number, lng: number) => {
    const checkin = checkins.find((c) => c.id === checkinId);
    if (!checkin) return;

    const checkOutTime = new Date();
    const checkInTime = new Date(checkin.check_in_time);
    const totalHours =
      (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
    const roundedHours = Math.round(totalHours * 100) / 100;

    // Check if checkout location is far from job site (geofence validation)
    let flagReason: string | null = null;
    if (checkin.job_site_id) {
      try {
        const { data: site } = await supabase
          .from("job_sites")
          .select("latitude, longitude, geofence_radius")
          .eq("id", checkin.job_site_id)
          .single();

        if (site?.latitude && site?.longitude) {
          const { haversineDistance, isWithinGeofence } = await import("@/lib/geofence");
          const radius = site.geofence_radius || 150;
          if (!isWithinGeofence(lat, lng, site.latitude, site.longitude, radius)) {
            const dist = Math.round(haversineDistance(lat, lng, site.latitude, site.longitude));
            flagReason = `Checkout ${dist}m from job site (outside ${radius}m geofence)`;
          }
        }
      } catch (err) {
        console.warn("Geofence check on checkout failed:", err);
      }
    }

    const { error } = await supabase
      .from("crew_checkins")
      .update({
        check_out_time: checkOutTime.toISOString(),
        check_out_lat: lat,
        check_out_lng: lng,
        total_hours: roundedHours,
        status: "checked_out",
        flag_reason: flagReason,
      })
      .eq("id", checkinId);

    if (error) {
      toast.error("Check-out failed: " + error.message);
      return;
    }

    // Auto-update total_paid on the contractor/employee record
    if (teamMemberId && businessUserId) {
      try {
        const { data: tm } = await supabase
          .from("team_members")
          .select("name, pay_rate, worker_type")
          .eq("id", teamMemberId)
          .single();

        if (tm && tm.pay_rate) {
          const sessionPay = Math.round(roundedHours * tm.pay_rate * 100) / 100;

          if (tm.worker_type === "1099" || tm.worker_type === "contractor") {
            // Get current total_paid, then increment
            const { data: contractor } = await supabase
              .from("contractors")
              .select("total_paid")
              .eq("user_id", businessUserId)
              .eq("name", tm.name)
              .maybeSingle();

            if (contractor) {
              const newTotal = (contractor.total_paid || 0) + sessionPay;
              await supabase
                .from("contractors")
                .update({ total_paid: newTotal })
                .eq("user_id", businessUserId)
                .eq("name", tm.name);
            }
          } else {
            // For W2 employees, increment salary as total earned
            const { data: employee } = await supabase
              .from("employees")
              .select("salary")
              .eq("user_id", businessUserId)
              .eq("name", tm.name)
              .maybeSingle();

            if (employee) {
              const newSalary = (employee.salary || 0) + sessionPay;
              await supabase
                .from("employees")
                .update({ salary: newSalary })
                .eq("user_id", businessUserId)
                .eq("name", tm.name);
            }
          }
        }
      } catch (err) {
        console.error("Failed to update total_paid:", err);
      }
    }

    if (flagReason) {
      toast.warning(`Checked out — ${totalHours.toFixed(1)} hours worked (flagged: checked out away from job site)`);
    } else {
      toast.success(`Checked out — ${totalHours.toFixed(1)} hours worked`);
    }
    setActiveCheckin(null);
    fetchCheckins();
  };

  return { checkins, loading, activeCheckin, checkIn, checkOut, refetch: fetchCheckins };
}
