import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useCrewCheckins } from "@/hooks/useCrewCheckins";
import { useGeofenceMonitor } from "@/hooks/useGeofenceMonitor";
import { useJobPhotos } from "@/hooks/useJobPhotos";
import { getCurrentPosition, isWithinGeofence, haversineDistance } from "@/lib/geofence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, LogOut, List, CalendarDays, MapPin as MapIcon, LogOut as SignOutIcon, UserCircle, AlertTriangle, Camera, Briefcase, DollarSign, Timer } from "lucide-react";
import { toast } from "sonner";
import LinkToBusinessCard from "@/components/LinkToBusinessCard";
import CrewJobsList, { type AssignedJob } from "@/components/crew/CrewJobsList";
import CrewCalendarView from "@/components/crew/CrewCalendarView";
import CrewMapView from "@/components/crew/CrewMapView";
import CrewProfileTab from "@/components/crew/CrewProfileTab";
import JobPhotosPanel from "@/components/job/JobPhotosPanel";
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
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ── Quick Stats Strip ──────────────────────────────── */
function QuickStats({ checkins, payRate, jobs }: { checkins: any[]; payRate: number | null; jobs: AssignedJob[] }) {
  const today = getTodayDateOnlyKey();
  const dayOfWeek = parseDateOnlyLocal(today).getDay();
  const weekStart = addDaysToDateOnly(today, -dayOfWeek);

  const weekCheckins = checkins.filter((c) => {
    const d = c.check_in_time?.slice(0, 10);
    return d && compareDateOnly(d, weekStart) >= 0;
  });

  const weekHours = weekCheckins.reduce((sum: number, c: any) => sum + (c.total_hours || 0), 0);
  const weekEarnings = payRate ? weekHours * payRate : 0;
  const todayJobCount = jobs.filter((j) => getNextInstanceDate(j) === today && j.status !== "completed").length;

  const stats = [
    { label: "Today", value: `${todayJobCount} job${todayJobCount !== 1 ? "s" : ""}`, icon: Briefcase },
    { label: "This Week", value: `${weekHours.toFixed(1)}h`, icon: Clock },
    ...(payRate ? [{ label: "Earned", value: `$${weekEarnings.toFixed(0)}`, icon: DollarSign }] : []),
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

/* ── Main Page ──────────────────────────────────────── */
export default function CrewDashboardPage() {
  const { user, signOut } = useAuth();
  const { teamMemberId, businessUserId } = useTeamRole();
  const { checkins, activeCheckin, checkIn, checkOut, refetch } = useCrewCheckins();
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState<string | null>(null);
  const [payRate, setPayRate] = useState<number | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [overtimeDialogOpen, setOvertimeDialogOpen] = useState(false);
  const [overtimeExplanation, setOvertimeExplanation] = useState("");
  const [pendingCheckoutCoords, setPendingCheckoutCoords] = useState<{ lat: number; lng: number } | null>(null);

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
        .select("id, title, description, start_date, end_date, status, site_id, job_type, recurring_interval, recurring_end_date, estimated_hours")
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

  const handleCheckIn = async (job: AssignedJob) => {
    const instanceDate = getNextInstanceDate(job);
    const startMs = parseDateOnlyLocal(instanceDate).setHours(0, 0, 0, 0);
    const endMs = parseDateOnlyLocal(instanceDate).setHours(23, 59, 59, 999);
    const nowMs = Date.now();
    if (nowMs < startMs || nowMs > endMs) {
      toast.error("You can only check in on the scheduled date for this job.");
      return;
    }
    setGpsLoading(job.id);
    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lng } = pos.coords;
      if (job.site.latitude != null && job.site.longitude != null) {
        const radius = job.site.geofence_radius || 150;
        if (!isWithinGeofence(lat, lng, job.site.latitude, job.site.longitude, radius)) {
          const dist = haversineDistance(lat, lng, job.site.latitude, job.site.longitude);
          toast.error(`You are ${Math.round(dist)}m away. Must be within ${radius}m.`);
          setGpsLoading(null);
          return;
        }
      }
      await checkIn(job.id, job.site.id, lat, lng, job.expectedHours, instanceDate);
    } catch (err: any) {
      toast.error(err.message || "Failed to get GPS location");
    }
    setGpsLoading(null);
  };

  const handleCheckOut = async () => {
    if (!activeCheckin) return;
    if (!photosComplete) { toast.error("Please upload both before and after photos before checking out."); return; }
    setGpsLoading("checkout");
    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lng } = pos.coords;
      const expectedHours = (activeCheckin as any).expected_hours;
      if (expectedHours && expectedHours > 0) {
        const elapsed = (Date.now() - new Date(activeCheckin.check_in_time).getTime()) / (1000 * 60 * 60);
        if (elapsed > expectedHours) {
          setPendingCheckoutCoords({ lat, lng });
          setOvertimeDialogOpen(true);
          setGpsLoading(null);
          return;
        }
      }
      await checkOut(activeCheckin.id, lat, lng);
    } catch (err: any) {
      toast.error(err.message || "Failed to get GPS location");
    }
    setGpsLoading(null);
  };

  const handleOvertimeCheckout = async () => {
    if (!activeCheckin || !pendingCheckoutCoords) return;
    if (!overtimeExplanation.trim()) { toast.error("Please provide an explanation for the overtime."); return; }
    setGpsLoading("checkout");
    await checkOut(activeCheckin.id, pendingCheckoutCoords.lat, pendingCheckoutCoords.lng, overtimeExplanation.trim());
    setOvertimeDialogOpen(false);
    setOvertimeExplanation("");
    setPendingCheckoutCoords(null);
    setGpsLoading(null);
  };

  const activeJob = activeCheckin ? assignedJobs.find((j) => j.id === activeCheckin.job_id) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {getGreeting()}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Here's your schedule overview
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            <SignOutIcon className="h-4 w-4" />
          </Button>
        </div>

        <LinkToBusinessCard />

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
                Checked in{activeJob ? ` — ${activeJob.title}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Since {new Date(activeCheckin.check_in_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
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
                      {hasBeforePhotos ? "✓" : "✗"} Before photo{hasBeforePhotos ? "" : " needed"}
                    </span>
                    <span className={hasAfterPhotos ? "text-primary" : "text-destructive"}>
                      {hasAfterPhotos ? "✓" : "✗"} After photo{hasAfterPhotos ? "" : " needed"}
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
                {!photosComplete ? "Upload photos to check out" : gpsLoading === "checkout" ? "Getting location…" : "Check Out"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        {loading ? (
          <p className="text-muted-foreground text-center py-12">Loading jobs…</p>
        ) : (
          <Tabs defaultValue="list">
            <TabsList className="w-full sticky bottom-0 sm:relative sm:bottom-auto z-10 bg-card border border-border">
              <TabsTrigger value="list" className="flex-1 gap-1.5">
                <List className="h-4 w-4" /> Jobs
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex-1 gap-1.5">
                <CalendarDays className="h-4 w-4" /> Calendar
              </TabsTrigger>
              <TabsTrigger value="map" className="flex-1 gap-1.5">
                <MapIcon className="h-4 w-4" /> Map
              </TabsTrigger>
              <TabsTrigger value="profile" className="flex-1 gap-1.5">
                <UserCircle className="h-4 w-4" /> Profile
              </TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="mt-4">
              <CrewJobsList jobs={assignedJobs} activeCheckin={activeCheckin} gpsLoading={gpsLoading} onCheckIn={handleCheckIn} />
            </TabsContent>
            <TabsContent value="calendar" className="mt-4">
              <CrewCalendarView jobs={assignedJobs} checkins={checkins} />
            </TabsContent>
            <TabsContent value="map" className="mt-4">
              <CrewMapView jobs={assignedJobs} />
            </TabsContent>
            <TabsContent value="profile" className="mt-4">
              <CrewProfileTab />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Overtime Dialog */}
      <Dialog open={overtimeDialogOpen} onOpenChange={(open) => {
        if (!open) { setOvertimeDialogOpen(false); setOvertimeExplanation(""); setPendingCheckoutCoords(null); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-chart-warning" />
              Overtime Explanation Required
            </DialogTitle>
            <DialogDescription>
              You've exceeded the scheduled time ({((activeCheckin as any)?.expected_hours || 0).toFixed(1)} hours). Please explain why.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. Client requested additional work, weather delay..."
            value={overtimeExplanation}
            onChange={(e) => setOvertimeExplanation(e.target.value)}
            rows={3}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setOvertimeDialogOpen(false); setOvertimeExplanation(""); setPendingCheckoutCoords(null); }}>
              Cancel
            </Button>
            <Button onClick={handleOvertimeCheckout} disabled={!overtimeExplanation.trim() || gpsLoading === "checkout"}>
              {gpsLoading === "checkout" ? "Checking out…" : "Submit & Check Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
