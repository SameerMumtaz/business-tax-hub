import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, isWithinGeofence, haversineDistance } from "@/lib/geofence";
import { toast } from "sonner";
import type { CrewCheckin } from "./useCrewCheckins";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_MISSED_PINGS = 2; // Auto-checkout after 2 consecutive out-of-fence pings

interface UseGeofenceMonitorOptions {
  activeCheckin: CrewCheckin | null;
  jobSite: { latitude: number | null; longitude: number | null; geofence_radius: number | null } | null;
  onAutoCheckout: () => void;
}

export function useGeofenceMonitor({ activeCheckin, jobSite, onAutoCheckout }: UseGeofenceMonitorOptions) {
  const missedPingsRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkGeofence = useCallback(async () => {
    if (!activeCheckin || !jobSite?.latitude || !jobSite?.longitude) return;

    // Check if expected hours cap exceeded (auto-flag but don't auto-checkout — let user explain)
    const expectedHours = (activeCheckin as any).expected_hours;
    if (expectedHours && expectedHours > 0) {
      const elapsed = (Date.now() - new Date(activeCheckin.check_in_time).getTime()) / (1000 * 60 * 60);
      // If 2x the expected hours have passed with no checkout, force auto-checkout
      if (elapsed > expectedHours * 2) {
        toast.error("Shift exceeded 2× scheduled duration — auto-checking out.");
        const now = new Date();
        const totalHours = Math.round(((now.getTime() - new Date(activeCheckin.check_in_time).getTime()) / (1000 * 60 * 60)) * 100) / 100;
        await supabase
          .from("crew_checkins")
          .update({
            check_out_time: now.toISOString(),
            total_hours: totalHours,
            status: "checked_out",
            flag_reason: `Auto-checkout: exceeded 2× scheduled duration (${expectedHours}h scheduled, ${totalHours}h elapsed)`,
          } as any)
          .eq("id", activeCheckin.id);
        missedPingsRef.current = 0;
        onAutoCheckout();
        return;
      }
    }

    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lng } = pos.coords;
      const radius = jobSite.geofence_radius || 150;
      const within = isWithinGeofence(lat, lng, jobSite.latitude, jobSite.longitude, radius);

      if (within) {
        missedPingsRef.current = 0;
      } else {
        missedPingsRef.current += 1;
        const dist = Math.round(haversineDistance(lat, lng, jobSite.latitude, jobSite.longitude));

        if (missedPingsRef.current >= MAX_MISSED_PINGS) {
          toast.warning("You've left the job site — auto-checking out.");
          
          const checkOutTime = new Date();
          const checkInTime = new Date(activeCheckin.check_in_time);
          const totalHours = Math.round(
            ((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) * 100
          ) / 100;

          await supabase
            .from("crew_checkins")
            .update({
              check_out_time: checkOutTime.toISOString(),
              check_out_lat: lat,
              check_out_lng: lng,
              total_hours: totalHours,
              status: "checked_out",
              flag_reason: `Auto-checkout: left geofence (${dist}m away, ${MAX_MISSED_PINGS} consecutive pings)`,
            } as any)
            .eq("id", activeCheckin.id);

          missedPingsRef.current = 0;
          onAutoCheckout();
        } else {
          toast.warning(
            `You are ${dist}m from the job site. Return within ${(MAX_MISSED_PINGS - missedPingsRef.current) * 5} minutes or you'll be auto-checked out.`
          );
        }
      }
    } catch (err) {
      console.warn("Geofence ping failed:", err);
    }
  }, [activeCheckin, jobSite, onAutoCheckout]);

  useEffect(() => {
    if (!activeCheckin || !jobSite?.latitude) {
      missedPingsRef.current = 0;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    // First ping after 5 minutes
    intervalRef.current = setInterval(checkGeofence, PING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeCheckin, jobSite, checkGeofence]);
}
