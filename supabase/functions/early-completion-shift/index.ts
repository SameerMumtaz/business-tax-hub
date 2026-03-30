import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Haversine distance in miles */
function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute travel buffer in minutes between two sites */
function getTravelMinutes(
  siteA: { latitude: number | null; longitude: number | null } | null,
  siteB: { latitude: number | null; longitude: number | null } | null,
): number {
  const MIN_BUFFER = 10;
  if (!siteA?.latitude || !siteA?.longitude || !siteB?.latitude || !siteB?.longitude) return MIN_BUFFER;
  if (siteA.latitude === siteB.latitude && siteA.longitude === siteB.longitude) return MIN_BUFFER;
  const miles = haversineDistanceMiles(siteA.latitude, siteA.longitude, siteB.latitude, siteB.longitude);
  const drivingMinutes = (miles / 30) * 60;
  return Math.max(MIN_BUFFER, Math.ceil(drivingMinutes / 5) * 5);
}

/** Parse "HH:MM" to total minutes */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Minutes back to "HH:MM" */
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mins = Math.round(m % 60);
  return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** Snap to nearest 5 minutes */
function snapTo5(minutes: number): number {
  return Math.round(minutes / 5) * 5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { checkin_id, team_member_id, business_user_id, job_id, actual_hours, estimated_hours } =
      await req.json();

    // Validate early completion criteria
    if (!checkin_id || !team_member_id || !business_user_id || !job_id) {
      return new Response(JSON.stringify({ shifted: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const timeSavedHours = (estimated_hours || 0) - (actual_hours || 0);
    const timeSavedMinutes = timeSavedHours * 60;

    // Must have saved ≥30 minutes AND worked ≥50% of estimated
    if (timeSavedMinutes < 30 || actual_hours < estimated_hours * 0.5) {
      return new Response(JSON.stringify({ shifted: 0, reason: "threshold_not_met" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get today's date
    const today = new Date().toISOString().split("T")[0];

    // Get completed job to know its site
    const { data: completedJob } = await supabase
      .from("jobs")
      .select("id, site_id, start_time, estimated_hours, title")
      .eq("id", job_id)
      .single();
    if (!completedJob) {
      return new Response(JSON.stringify({ shifted: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get all of this crew member's assignments
    const { data: allAssignments } = await supabase
      .from("job_assignments")
      .select("job_id, worker_id")
      .eq("worker_id", team_member_id);

    if (!allAssignments || allAssignments.length === 0) {
      return new Response(JSON.stringify({ shifted: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const assignedJobIds = allAssignments.map((a) => a.job_id);

    // Get today's remaining jobs for this crew member (after the completed job's time)
    const { data: todayJobs } = await supabase
      .from("jobs")
      .select("id, title, start_date, start_time, estimated_hours, site_id, status, job_type, recurring_interval")
      .eq("user_id", business_user_id)
      .in("id", assignedJobIds)
      .neq("id", job_id);

    if (!todayJobs || todayJobs.length === 0) {
      return new Response(JSON.stringify({ shifted: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter to today's jobs that haven't started yet
    const remainingJobs = todayJobs.filter((j) => {
      // For recurring jobs, check if they occur today
      const isToday = j.start_date === today || (j.job_type === "recurring" && j.start_date <= today);
      if (!isToday) return false;
      // Must have a start time and not be completed/in_progress
      if (!j.start_time) return false;
      if (j.status === "completed" || j.status === "in_progress") return false;
      // Must be after the completed job
      if (completedJob.start_time && timeToMinutes(j.start_time) <= timeToMinutes(completedJob.start_time)) return false;
      return true;
    });

    if (remainingJobs.length === 0) {
      return new Response(JSON.stringify({ shifted: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Sort by start time
    remainingJobs.sort((a, b) => timeToMinutes(a.start_time!) - timeToMinutes(b.start_time!));

    // Load all relevant sites for travel calculation
    const siteIds = new Set<string>();
    siteIds.add(completedJob.site_id);
    remainingJobs.forEach((j) => siteIds.add(j.site_id));
    const { data: sitesData } = await supabase
      .from("job_sites")
      .select("id, latitude, longitude")
      .in("id", Array.from(siteIds));
    const siteMap = new Map<string, { latitude: number | null; longitude: number | null }>();
    (sitesData || []).forEach((s) => siteMap.set(s.id, { latitude: s.latitude, longitude: s.longitude }));

    // Calculate the new available start = now (actual checkout time)
    const checkoutMinutes = snapTo5(
      new Date().getHours() * 60 + new Date().getMinutes()
    );

    // Shift jobs: each job starts at max(checkoutTime + travel, shifted previous end + travel)
    const updates: { id: string; title: string; old_time: string; new_time: string }[] = [];
    let previousEndMinutes = checkoutMinutes;
    let previousSiteId = completedJob.site_id;

    for (const job of remainingJobs) {
      const originalMinutes = timeToMinutes(job.start_time!);
      const travelBuffer = getTravelMinutes(siteMap.get(previousSiteId) || null, siteMap.get(job.site_id) || null);
      const earliestStart = snapTo5(previousEndMinutes + travelBuffer);

      // Only shift earlier, never later
      if (earliestStart >= originalMinutes) {
        previousEndMinutes = originalMinutes + Math.round((job.estimated_hours || 1) * 60);
        previousSiteId = job.site_id;
        continue;
      }

      const newTime = minutesToTime(earliestStart);
      updates.push({ id: job.id, title: job.title, old_time: job.start_time!, new_time: newTime });
      previousEndMinutes = earliestStart + Math.round((job.estimated_hours || 1) * 60);
      previousSiteId = job.site_id;
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ shifted: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Apply updates
    for (const upd of updates) {
      await supabase.from("jobs").update({ start_time: upd.new_time }).eq("id", upd.id);
    }

    // Get crew member name for notification
    const { data: tm } = await supabase
      .from("team_members")
      .select("name")
      .eq("id", team_member_id)
      .single();
    const crewName = tm?.name || "Crew member";

    // Build notification details
    const shiftDetails = updates
      .map((u) => `• ${u.title}: ${u.old_time} → ${u.new_time}`)
      .join("\n");

    const savedMins = Math.round(timeSavedMinutes);

    // Notify business owner
    await supabase.from("notifications").insert({
      user_id: business_user_id,
      title: "Schedule Shifted — Early Completion",
      message: `${crewName} finished "${completedJob.title}" ${savedMins}min early. ${updates.length} job${updates.length > 1 ? "s" : ""} shifted up:\n${shiftDetails}`,
      type: "info",
    } as any);

    return new Response(
      JSON.stringify({ shifted: updates.length, updates }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Early completion shift error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
