import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useCrewCheckins } from "@/hooks/useCrewCheckins";
import { useGeofenceMonitor } from "@/hooks/useGeofenceMonitor";
import { useJobPhotos } from "@/hooks/useJobPhotos";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRouteOptimization, type OptimizedRoute } from "@/hooks/useRouteOptimization";
import { getCurrentPosition, isWithinGeofence, haversineDistance } from "@/lib/geofence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, LogOut, List, CalendarDays, MapPin as MapIcon, LogOut as SignOutIcon, UserCircle, AlertTriangle, Camera, Briefcase, DollarSign, Timer, Navigation, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import CrewJobsList, { type AssignedJob } from "@/components/crew/CrewJobsList";
import CrewCalendarView from "@/components/crew/CrewCalendarView";
import CrewMapView from "@/components/crew/CrewMapView";
import CrewProfileTab from "@/components/crew/CrewProfileTab";
import JobPhotosPanel from "@/components/job/JobPhotosPanel";
import RouteOptimizationDialog from "@/components/route/RouteOptimizationDialog";
import CrewChatTab from "@/components/crew/CrewChatTab";
import CrewStatusWidgets from "@/components/crew/CrewStatusWidgets";
import { parseDateOnlyLocal, getTodayDateOnlyKey, getNextInstanceDate, isRecurringJobToday, addDaysToDateOnly, compareDateOnly } from "@/lib/dateOnly";

/* ── Live elapsed timer ─────────────────────────────── */
function LiveElapsed({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [since]);
  return <div className="text-2xl font-mono font-bold text-primary tabular-nums">{elapsed}</div>;
}

/* ── Elapsed progress for check-in card ─────────────── */
function ElapsedProgress({ since, expectedHours }: { since: string; expectedHours: number | null }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!expectedHours || expectedHours <= 0) return;
    const update = () => {
      const elapsedH = (Date.now() - new Date(since).getTime()) / (1000 * 60 * 60);
      setPct(Math.min(100, Math.round((elapsedH / expectedHours) * 100)));
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [since, expectedHours]);

  if (!expectedHours || expectedHours <= 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span>{pct}% of {expectedHours}h</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

/* ── Greeting helper ────────────────────────────────── */
function useGreeting(): string {
  const { t } = useLanguage();
  const h = new Date().getHours();
  if (h < 12) return t("greeting.morning");
  if (h < 17) return t("greeting.afternoon");
  return t("greeting.evening");
}

/* ── Quick Stats Strip ──────────────────────────────── */
function QuickStats({ checkins, payRate, jobs }: { checkins: any[]; payRate: number | null; jobs: AssignedJob[] }) {
  const { t } = useLanguage();
  const today = getTodayDateOnlyKey();
  const dayOfWeek = parseDateOnlyLocal(today).getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = addDaysToDateOnly(today, -mondayOffset);

  const weekCheckins = checkins.filter((c) => {
    const d = c.check_in_time?.slice(0, 10);
    return d && compareDateOnly(d, weekStart) >= 0;
  });

  const weekHours = weekCheckins.reduce((sum: number, c: any) => sum + (c.total_hours || 0), 0);
  const weekEarnings = payRate ? weekHours * payRate : 0;
  const todayJobCount = jobs.filter((j) => getNextInstanceDate(j) === today && j.status !== "completed").length;

  const stats = [
    { label: t("stats.today"), value: `${todayJobCount} ${todayJobCount !== 1 ? t("jobs.jobPlural") : t("jobs.job")}`, icon: Briefcase },
    { label: t("stats.thisWeek"), value: `${weekHours.toFixed(1)}h`, icon: Clock },
    ...(payRate ? [{ label: t("stats.earned"), value: `$${weekEarnings.toFixed(0)}`, icon: DollarSign }] : []),
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <Card key={s.label} className="bg-card">
          <CardContent className="p-3 text-center">
            <s.icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-semibold font-mono tabular-nums text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ── Explanation reasons type ───────────────────────── */
type ExplanationReason = "lateCheckin" | "earlyCheckout" | "overtimeCheckout" | "geofenceCheckout";

interface ExplanationItem {
  reason: ExplanationReason;
  detail: string; // e.g. "23 minutes late" or "150m from job site"
}

/* ── Main Page ──────────────────────────────────────── */
export default function CrewDashboardPage() {
  const { user, signOut } = useAuth();
  const { teamMemberId, businessUserId } = useTeamRole();
  const { t } = useLanguage();
  const greeting = useGreeting();
  const { checkins, activeCheckin, checkIn, checkOut, refetch } = useCrewCheckins();
  const { loading: routeLoading, optimizeRoute, submitRequest } = useRouteOptimization();
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState<string | null>(null);
  const [payRate, setPayRate] = useState<number | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);
  const [routeSubmitting, setRouteSubmitting] = useState(false);

  // Unified explanation dialog state
  const [explanationDialogOpen, setExplanationDialogOpen] = useState(false);
  const [explanationItems, setExplanationItems] = useState<ExplanationItem[]>([]);
  const [explanationTexts, setExplanationTexts] = useState<Record<ExplanationReason, string>>({
    lateCheckin: "",
    earlyCheckout: "",
    overtimeCheckout: "",
    geofenceCheckout: "",
  });
  const [pendingAction, setPendingAction] = useState<"checkin" | "checkout" | null>(null);
  const [pendingCheckoutCoords, setPendingCheckoutCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingCheckinJob, setPendingCheckinJob] = useState<AssignedJob | null>(null);

  // Photo requirement for checkout
  const activeJobId = activeCheckin?.job_id || null;
  const activeOccurrenceDate = activeCheckin?.occurrence_date || null;
  const { photoCountByType } = useJobPhotos(activeJobId, activeOccurrenceDate);
  const hasBeforePhotos = photoCountByType.before > 0;
  const hasAfterPhotos = photoCountByType.after > 0;
  const photosComplete = hasBeforePhotos && hasAfterPhotos;

  const activeJobSite = useMemo(() => {
    if (!activeCheckin) return null;
    return assignedJobs.find((j) => j.id === activeCheckin.job_id)?.site ?? null;
  }, [activeCheckin, assignedJobs]);

  useGeofenceMonitor({ activeCheckin, jobSite: activeJobSite, onAutoCheckout: refetch });

  // Fetch crew member name
  useEffect(() => {
    if (!teamMemberId) return;
    supabase.from("team_members").select("name").eq("id", teamMemberId).single().then(({ data }) => {
      if (data?.name) setFirstName(data.name.split(" ")[0]);
    });
  }, [teamMemberId]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !teamMemberId) { setLoading(false); return; }

      const { data: memberData } = await supabase.from("team_members").select("pay_rate").eq("id", teamMemberId).single();
      const rate = memberData?.pay_rate ?? null;
      setPayRate(rate);

      const [assignRes, tsEntryRes] = await Promise.all([
        supabase.from("job_assignments").select("job_id").eq("worker_id", teamMemberId),
        supabase.from("timesheet_entries").select("job_id").eq("worker_id", teamMemberId).not("job_id", "is", null),
      ]);

      const jobIdSet = new Set<string>();
      (assignRes.data || []).forEach((a: any) => jobIdSet.add(a.job_id));
      (tsEntryRes.data || []).forEach((e: any) => { if (e.job_id) jobIdSet.add(e.job_id); });

      const jobIds = Array.from(jobIdSet);
      if (!jobIds.length) { setAssignedJobs([]); setLoading(false); return; }

      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, title, description, start_date, end_date, start_time, status, site_id, job_type, recurring_interval, recurring_end_date, estimated_hours")
        .in("id", jobIds)
        .in("status", ["scheduled", "in_progress", "completed"]);

      if (!jobs?.length) { setAssignedJobs([]); setLoading(false); return; }

      const siteIds = [...new Set(jobs.map((j: any) => j.site_id))];
      const { data: sites } = await supabase.from("job_sites").select("id, name, address, latitude, longitude, geofence_radius").in("id", siteIds);
      const siteMap = new Map((sites || []).map((s: any) => [s.id, s]));

      setAssignedJobs(
        jobs.map((j: any) => {
          let expectedHours: number | null = j.estimated_hours ?? null;
          if (expectedHours == null && j.end_date) {
            const diff = parseDateOnlyLocal(j.end_date).getTime() - parseDateOnlyLocal(j.start_date).getTime();
            expectedHours = Math.round((diff / (1000 * 60 * 60)) * 10) / 10;
            if (expectedHours > 24) expectedHours = 8;
          }
          return {
            ...j,
            site: siteMap.get(j.site_id) || { id: j.site_id, name: "Unknown", address: null, latitude: null, longitude: null, geofence_radius: null },
            expectedHours,
            expectedPay: expectedHours && rate ? Math.round(expectedHours * rate * 100) / 100 : null,
          };
        })
      );
      setLoading(false);
    };
    fetchData();
  }, [user, teamMemberId]);

  /* ── Check-in handler ────────────────────────────── */
  const handleCheckIn = async (job: AssignedJob) => {
    const instanceDate = getNextInstanceDate(job);
    const startMs = parseDateOnlyLocal(instanceDate).setHours(0, 0, 0, 0);
    const endMs = parseDateOnlyLocal(instanceDate).setHours(23, 59, 59, 999);
    const nowMs = Date.now();
    if (nowMs < startMs || nowMs > endMs) {
      toast.error(t("error.checkInDate"));
      return;
    }

    // Check for late check-in (>15 min after start_time)
    if (job.start_time) {
      const [h, m] = job.start_time.split(":").map(Number);
      const scheduledStart = new Date();
      scheduledStart.setHours(h, m, 0, 0);
      const graceMs = 15 * 60 * 1000; // 15 minute grace period
      const lateMs = nowMs - scheduledStart.getTime();
      if (lateMs > graceMs) {
        const lateMinutes = Math.round(lateMs / 60000);
        setPendingCheckinJob(job);
        setPendingAction("checkin");
        setExplanationItems([{
          reason: "lateCheckin",
          detail: `${lateMinutes} minutes late (scheduled: ${job.start_time.slice(0, 5)})`,
        }]);
        setExplanationTexts({ lateCheckin: "", earlyCheckout: "", overtimeCheckout: "", geofenceCheckout: "" });
        setExplanationDialogOpen(true);
        return;
      }
    }

    await performCheckIn(job);
  };

  const performCheckIn = async (job: AssignedJob, lateNote?: string) => {
    const instanceDate = getNextInstanceDate(job);
    setGpsLoading(job.id);
    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lng } = pos.coords;
      if (job.site.latitude != null && job.site.longitude != null) {
        const radius = job.site.geofence_radius || 150;
        if (!isWithinGeofence(lat, lng, job.site.latitude, job.site.longitude, radius)) {
          const dist = haversineDistance(lat, lng, job.site.latitude, job.site.longitude);
          toast.error(`${Math.round(dist)}m ${t("error.tooFar")} ${radius}m.`);
          setGpsLoading(null);
          return;
        }
      }
      const result = await checkIn(job.id, job.site.id, lat, lng, job.expectedHours, instanceDate);

      // If late, save the note and flag + notify
      if (lateNote && result) {
        await supabase
          .from("crew_checkins")
          .update({ notes: `Late check-in: ${lateNote}`, flag_reason: `Late check-in` } as any)
          .eq("id", (result as any).id);

        // Notify admin/manager
        if (businessUserId && teamMemberId) {
          const { data: tm } = await supabase.from("team_members").select("name").eq("id", teamMemberId).single();
          await supabase.from("notifications").insert({
            user_id: businessUserId,
            title: "Late Check-In",
            message: `${tm?.name || "Crew member"} checked in late for "${job.title}". Reason: ${lateNote}`,
            type: "warning",
          } as any);
        }
      }
    } catch (err: any) {
      toast.error(err.message || t("error.gps"));
    }
    setGpsLoading(null);
  };

  /* ── Check-out handler ───────────────────────────── */
  const handleCheckOut = async () => {
    if (!activeCheckin) return;
    if (!photosComplete) { toast.error(t("error.photos")); return; }
    setGpsLoading("checkout");
    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lng } = pos.coords;

      const reasons: ExplanationItem[] = [];
      const expectedHours = (activeCheckin as any).expected_hours;
      const elapsedHours = (Date.now() - new Date(activeCheckin.check_in_time).getTime()) / (1000 * 60 * 60);

      // Check geofence
      if (activeJobSite?.latitude && activeJobSite?.longitude) {
        const radius = activeJobSite.geofence_radius || 150;
        if (!isWithinGeofence(lat, lng, activeJobSite.latitude, activeJobSite.longitude, radius)) {
          const dist = Math.round(haversineDistance(lat, lng, activeJobSite.latitude, activeJobSite.longitude));
          reasons.push({ reason: "geofenceCheckout", detail: `${dist}m from job site (outside ${radius}m geofence)` });
        }
      }

      // Check time variance
      if (expectedHours && expectedHours > 0) {
        if (elapsedHours <= expectedHours * 0.5) {
          // Under 50% of expected time
          reasons.push({ reason: "earlyCheckout", detail: `${elapsedHours.toFixed(1)}h worked vs ${expectedHours}h expected (${Math.round((elapsedHours / expectedHours) * 100)}%)` });
        } else if (elapsedHours >= expectedHours * 1.2) {
          // Over 120% of expected time
          reasons.push({ reason: "overtimeCheckout", detail: `${elapsedHours.toFixed(1)}h worked vs ${expectedHours}h expected (${Math.round((elapsedHours / expectedHours) * 100)}%)` });
        }
      }

      if (reasons.length > 0) {
        setPendingCheckoutCoords({ lat, lng });
        setPendingAction("checkout");
        setExplanationItems(reasons);
        setExplanationTexts({ lateCheckin: "", earlyCheckout: "", overtimeCheckout: "", geofenceCheckout: "" });
        setExplanationDialogOpen(true);
        setGpsLoading(null);
        return;
      }

      await checkOut(activeCheckin.id, lat, lng);
    } catch (err: any) {
      toast.error(err.message || t("error.gps"));
    }
    setGpsLoading(null);
  };

  /* ── Submit explanations ─────────────────────────── */
  const handleExplanationSubmit = async () => {
    // Validate all explanations are filled
    for (const item of explanationItems) {
      if (!explanationTexts[item.reason].trim()) {
        toast.error(t("explain.required"));
        return;
      }
    }

    if (pendingAction === "checkin" && pendingCheckinJob) {
      await performCheckIn(pendingCheckinJob, explanationTexts.lateCheckin.trim());
    } else if (pendingAction === "checkout" && activeCheckin && pendingCheckoutCoords) {
      setGpsLoading("checkout");

      // Build combined notes from all explanations
      const notesParts: string[] = [];
      const flagParts: string[] = [];

      for (const item of explanationItems) {
        const text = explanationTexts[item.reason].trim();
        switch (item.reason) {
          case "geofenceCheckout":
            notesParts.push(`Off-site checkout: ${text}`);
            flagParts.push(`Off-site checkout (${item.detail})`);
            break;
          case "earlyCheckout":
            notesParts.push(`Early completion: ${text}`);
            flagParts.push(`Early completion (${item.detail})`);
            break;
          case "overtimeCheckout":
            notesParts.push(`Overtime: ${text}`);
            flagParts.push(`Overtime (${item.detail})`);
            break;
        }
      }

      await checkOut(
        activeCheckin.id,
        pendingCheckoutCoords.lat,
        pendingCheckoutCoords.lng,
        notesParts.join(" | "),
        flagParts.length > 0 ? flagParts.join(" | ") : undefined,
      );

      // Notify admin/manager about flagged checkout
      if (businessUserId && teamMemberId) {
        const { data: tm } = await supabase.from("team_members").select("name").eq("id", teamMemberId).single();
        const activeJob = assignedJobs.find((j) => j.id === activeCheckin.job_id);
        const jobTitle = activeJob?.title || "Unknown job";

        for (const item of explanationItems) {
          const text = explanationTexts[item.reason].trim();
          let title = "";
          let message = "";
          let type = "warning";

          switch (item.reason) {
            case "earlyCheckout":
              title = "Early Job Completion";
              message = `${tm?.name || "Crew member"} completed "${jobTitle}" in ${item.detail}. Reason: ${text}`;
              type = "warning";
              break;
            case "overtimeCheckout":
              title = "Overtime Reported";
              message = `${tm?.name || "Crew member"} worked overtime on "${jobTitle}" — ${item.detail}. Reason: ${text}`;
              type = "info";
              break;
            case "geofenceCheckout":
              title = "Off-Site Checkout";
              message = `${tm?.name || "Crew member"} checked out away from "${jobTitle}" — ${item.detail}. Reason: ${text}`;
              type = "warning";
              break;
          }

          if (title) {
            await supabase.from("notifications").insert({
              user_id: businessUserId,
              title,
              message,
              type,
            } as any);
          }
        }
      }

      setGpsLoading(null);
    }

    setExplanationDialogOpen(false);
    setExplanationItems([]);
    setExplanationTexts({ lateCheckin: "", earlyCheckout: "", overtimeCheckout: "", geofenceCheckout: "" });
    setPendingCheckoutCoords(null);
    setPendingCheckinJob(null);
    setPendingAction(null);
  };

  const activeJob = activeCheckin ? assignedJobs.find((j) => j.id === activeCheckin.job_id) : null;

  /* ── Route Optimization ──────────────────────────── */
  const todayKey = getTodayDateOnlyKey();
  const todayJobs = useMemo(() => {
    return assignedJobs.filter((j) => {
      const instanceDate = getNextInstanceDate(j);
      return instanceDate === todayKey && j.status !== "completed";
    }).sort((a, b) => {
      if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
      return 0;
    });
  }, [assignedJobs, todayKey]);

  const handleOptimizeRoute = async () => {
    if (todayJobs.length < 2) {
      toast.error("Need at least 2 jobs today to optimize route");
      return;
    }

    setRouteDialogOpen(true);
    setOptimizedRoute(null);

    try {
      const pos = await getCurrentPosition();
      const currentLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      const siteMap = new Map<string, { id: string; name: string; lat: number; lng: number }>();
      for (const job of todayJobs) {
        if (job.site.latitude && job.site.longitude) {
          siteMap.set(job.site.id, {
            id: job.site.id,
            name: job.site.name,
            lat: job.site.latitude,
            lng: job.site.longitude,
          });
        }
      }

      const routeJobs = todayJobs.map((j) => ({
        id: j.id,
        title: j.title,
        site_id: j.site.id,
        start_time: j.start_time,
        estimated_hours: j.expectedHours,
      }));

      const result = await optimizeRoute(currentLoc, routeJobs, siteMap);
      setOptimizedRoute(result);
    } catch (err: any) {
      toast.error(err.message || "Failed to get location");
      setRouteDialogOpen(false);
    }
  };

  const handleSubmitRoute = async () => {
    if (!optimizedRoute || !teamMemberId || !businessUserId) return;
    setRouteSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      const success = await submitRequest(
        teamMemberId,
        businessUserId,
        todayKey,
        pos.coords.latitude,
        pos.coords.longitude,
        optimizedRoute,
      );
      if (success) setRouteDialogOpen(false);
    } catch {}
    setRouteSubmitting(false);
  };

  const reasonLabels: Record<ExplanationReason, { title: string; desc: string; placeholder: string }> = {
    lateCheckin: { title: t("explain.lateCheckin"), desc: t("explain.lateCheckinDesc"), placeholder: t("explain.lateCheckinPlaceholder") },
    earlyCheckout: { title: t("explain.earlyCheckout"), desc: t("explain.earlyCheckoutDesc"), placeholder: t("explain.earlyCheckoutPlaceholder") },
    overtimeCheckout: { title: t("explain.overtimeCheckout"), desc: t("explain.overtimeCheckoutDesc"), placeholder: t("explain.overtimeCheckoutPlaceholder") },
    geofenceCheckout: { title: t("explain.geofenceCheckout"), desc: t("explain.geofenceCheckoutDesc"), placeholder: t("explain.geofenceCheckoutPlaceholder") },
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {greeting}{firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("greeting.schedule")}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <SignOutIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Status Widgets */}
          {!loading && (
            <CrewStatusWidgets
              jobs={assignedJobs}
              activeCheckin={activeCheckin}
              checkins={checkins}
              payRate={payRate}
            />
          )}
        </div>

        {/* Quick Stats */}
        {!loading && (
          <QuickStats checkins={checkins} payRate={payRate} jobs={assignedJobs} />
        )}


        {/* Active Check-in Card */}
        {activeCheckin && (
          <Card className="border-2 border-primary bg-accent/30">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                {t("checkin.checkedIn")}{activeJob ? ` — ${activeJob.title}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {t("checkin.since")} {new Date(activeCheckin.check_in_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
                {payRate && <span className="text-xs text-muted-foreground">${payRate}/hr</span>}
              </div>

              <LiveElapsed since={activeCheckin.check_in_time} />
              <ElapsedProgress since={activeCheckin.check_in_time} expectedHours={(activeCheckin as any).expected_hours} />

              {/* Photo requirements */}
              {activeJobId && (
                <div className="space-y-2">
                  <div className="flex gap-3 text-xs">
                    <span className={hasBeforePhotos ? "text-primary" : "text-destructive"}>
                      {hasBeforePhotos ? "✓" : "✗"} {t("checkin.beforePhoto")}{hasBeforePhotos ? "" : ` ${t("checkin.needed")}`}
                    </span>
                    <span className={hasAfterPhotos ? "text-primary" : "text-destructive"}>
                      {hasAfterPhotos ? "✓" : "✗"} {t("checkin.afterPhoto")}{hasAfterPhotos ? "" : ` ${t("checkin.needed")}`}
                    </span>
                  </div>
                  <JobPhotosPanel jobId={activeJobId} occurrenceDate={activeOccurrenceDate} compact />
                </div>
              )}

              <Button
                variant="destructive"
                className="w-full h-11"
                onClick={handleCheckOut}
                disabled={gpsLoading === "checkout" || !photosComplete}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {!photosComplete ? t("checkin.uploadPhotos") : gpsLoading === "checkout" ? t("checkin.gettingLocation") : t("checkin.checkOut")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        {loading ? (
          <p className="text-muted-foreground text-center py-12">{t("loading.jobs")}</p>
        ) : (
          <Tabs defaultValue="list">
            <TabsList className="w-full sticky bottom-0 sm:relative sm:bottom-auto z-10 bg-card border border-border overflow-x-auto">
              <TabsTrigger value="list" className="flex-1 gap-1 min-w-0 px-2">
                <List className="h-4 w-4 shrink-0" /> <span className="truncate text-xs sm:text-sm">{t("tab.jobs")}</span>
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex-1 gap-1 min-w-0 px-2">
                <CalendarDays className="h-4 w-4 shrink-0" /> <span className="truncate text-xs sm:text-sm">{t("tab.calendar")}</span>
              </TabsTrigger>
              <TabsTrigger value="map" className="flex-1 gap-1 min-w-0 px-2">
                <MapIcon className="h-4 w-4 shrink-0" /> <span className="truncate text-xs sm:text-sm">{t("tab.map")}</span>
              </TabsTrigger>
              <TabsTrigger value="messages" className="flex-1 gap-1 min-w-0 px-2">
                <MessageSquare className="h-4 w-4 shrink-0" /> <span className="truncate text-xs sm:text-sm">Chat</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="flex-1 gap-1 min-w-0 px-2">
                <UserCircle className="h-4 w-4 shrink-0" /> <span className="truncate text-xs sm:text-sm">{t("tab.profile")}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="mt-4">
              <CrewJobsList jobs={assignedJobs} activeCheckin={activeCheckin} gpsLoading={gpsLoading} onCheckIn={handleCheckIn} checkins={checkins} />
            </TabsContent>
            <TabsContent value="calendar" className="mt-4">
              <CrewCalendarView jobs={assignedJobs} checkins={checkins} />
            </TabsContent>
            <TabsContent value="map" className="mt-4">
              <CrewMapView jobs={assignedJobs} />
            </TabsContent>
            <TabsContent value="messages" className="mt-4">
              <CrewChatTab />
            </TabsContent>
            <TabsContent value="profile" className="mt-4">
              <CrewProfileTab />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Unified Explanation Dialog */}
      <Dialog open={explanationDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setExplanationDialogOpen(false);
          setExplanationItems([]);
          setExplanationTexts({ lateCheckin: "", earlyCheckout: "", overtimeCheckout: "", geofenceCheckout: "" });
          setPendingCheckoutCoords(null);
          setPendingCheckinJob(null);
          setPendingAction(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-chart-warning" />
              {t("explain.title")}
            </DialogTitle>
            <DialogDescription>
              {t("explain.required")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {explanationItems.map((item) => {
              const labels = reasonLabels[item.reason];
              return (
                <div key={item.reason} className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{labels.title}</p>
                    <p className="text-xs text-muted-foreground">{labels.desc}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5 italic">{item.detail}</p>
                  </div>
                  <Textarea
                    placeholder={labels.placeholder}
                    value={explanationTexts[item.reason]}
                    onChange={(e) => setExplanationTexts((prev) => ({ ...prev, [item.reason]: e.target.value }))}
                    rows={2}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setExplanationDialogOpen(false);
              setExplanationItems([]);
              setPendingCheckoutCoords(null);
              setPendingCheckinJob(null);
              setPendingAction(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleExplanationSubmit}
              disabled={explanationItems.some((item) => !explanationTexts[item.reason].trim()) || gpsLoading === "checkout"}
            >
              {gpsLoading === "checkout"
                ? t("checkin.gettingLocation")
                : pendingAction === "checkout"
                  ? t("explain.submitCheckout")
                  : t("explain.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Route Optimization Dialog */}
      <RouteOptimizationDialog
        open={routeDialogOpen}
        onOpenChange={setRouteDialogOpen}
        route={optimizedRoute}
        loading={routeLoading}
        onSubmit={handleSubmitRoute}
        submitting={routeSubmitting}
      />
    </div>
  );
}
