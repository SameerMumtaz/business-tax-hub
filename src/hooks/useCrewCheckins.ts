import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTodayDateOnlyKey } from "@/lib/dateOnly";
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
  flag_reason: string | null;
  created_at: string;
  occurrence_date: string | null;
  expected_hours: number | null;
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

    if (role === "crew" && teamMemberId) {
      query = query.eq("team_member_id", teamMemberId);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load check-ins");
    } else {
      const items = (data || []) as CrewCheckin[];
      setCheckins(items);
      if (teamMemberId) {
        setActiveCheckin(
          items.find((c) => c.team_member_id === teamMemberId && c.status === "checked_in") || null,
        );
      }
    }
    setLoading(false);
  }, [teamMemberId, role]);

  useEffect(() => {
    fetchCheckins();
  }, [fetchCheckins]);

  useEffect(() => {
    const channel = supabase
      .channel("crew_checkins_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crew_checkins" },
        () => fetchCheckins(),
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
    lng: number,
    expectedHours?: number | null,
    occurrenceDate?: string,
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
        expected_hours: expectedHours ?? null,
        occurrence_date: occurrenceDate || getTodayDateOnlyKey(),
      } as any)
      .select()
      .single();

    if (error) {
      toast.error("Check-in failed: " + error.message);
      return null;
    }

    if (jobId) {
      await supabase.rpc("update_job_status_on_checkin", {
        _job_id: jobId,
        _new_status: "in_progress",
      });
    }

    toast.success("Checked in successfully!");
    setActiveCheckin(data as CrewCheckin);
    return data;
  };

  const checkOut = async (
    checkinId: string,
    lat: number,
    lng: number,
    overtimeNotes?: string,
    flagReasonOverride?: string,
  ) => {
    const checkin = checkins.find((c) => c.id === checkinId);
    if (!checkin) return;

    const checkOutTime = new Date();
    const checkInTime = new Date(checkin.check_in_time);
    const totalHours =
      (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
    const roundedHours = Math.round(totalHours * 100) / 100;

    // Use provided flag reason, or check geofence
    let flagReason: string | null = flagReasonOverride || null;
    if (!flagReason && checkin.job_site_id) {
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
        notes: overtimeNotes || null,
      } as any)
      .eq("id", checkinId);

    if (error) {
      toast.error("Check-out failed: " + error.message);
      return;
    }

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

    // Mark job as completed
    if (checkin.job_id) {
      await supabase.rpc("update_job_status_on_checkin", {
        _job_id: checkin.job_id,
        _new_status: "completed",
      });

      // Trigger early completion schedule shift if applicable
      if (
        checkin.expected_hours &&
        checkin.expected_hours > 0 &&
        roundedHours >= checkin.expected_hours * 0.5 &&
        (checkin.expected_hours - roundedHours) * 60 >= 30 &&
        teamMemberId &&
        businessUserId
      ) {
        try {
          await supabase.functions.invoke("early-completion-shift", {
            body: {
              checkin_id: checkinId,
              team_member_id: teamMemberId,
              business_user_id: businessUserId,
              job_id: checkin.job_id,
              actual_hours: roundedHours,
              estimated_hours: checkin.expected_hours,
            },
          });
        } catch (err) {
          console.warn("Early completion shift failed:", err);
        }
      }
    }

    if (flagReason) {
      toast.warning(`Checked out — ${totalHours.toFixed(1)} hours worked (flagged)`);
    } else {
      toast.success(`Checked out — ${totalHours.toFixed(1)} hours worked`);
    }
    setActiveCheckin(null);
    fetchCheckins();
  };

  return { checkins, loading, activeCheckin, checkIn, checkOut, refetch: fetchCheckins };
}
