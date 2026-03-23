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
import { CheckCircle, Clock, LogOut, List, CalendarDays, MapPin as MapIcon, LogOut as SignOutIcon, UserCircle, AlertTriangle, Camera, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import LinkToBusinessCard from "@/components/LinkToBusinessCard";
import CrewJobsList, { type AssignedJob } from "@/components/crew/CrewJobsList";
import CrewCalendarView from "@/components/crew/CrewCalendarView";
import CrewMapView from "@/components/crew/CrewMapView";
import CrewProfileTab from "@/components/crew/CrewProfileTab";
import JobPhotosPanel from "@/components/job/JobPhotosPanel";

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
  return <div className="text-lg font-mono font-bold text-primary tabular-nums">{elapsed}</div>;
}

export default function CrewDashboardPage() {
  const { user, signOut } = useAuth();
  const { teamMemberId, businessUserId } = useTeamRole();
  const { activeCheckin, checkIn, checkOut, refetch } = useCrewCheckins();
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState<string | null>(null);
  const [payRate, setPayRate] = useState<number | null>(null);
  const [overtimeDialogOpen, setOvertimeDialogOpen] = useState(false);
  const [overtimeExplanation, setOvertimeExplanation] = useState("");
  const [pendingCheckoutCoords, setPendingCheckoutCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Photo requirement for checkout
  const activeJobId = activeCheckin?.job_id || null;
  const { photoCountByType } = useJobPhotos(activeJobId);
  const hasBeforePhotos = photoCountByType.before > 0;
  const hasAfterPhotos = photoCountByType.after > 0;
  const photosComplete = hasBeforePhotos && hasAfterPhotos;

  // Find the job site for the active check-in to feed into geofence monitor
  const activeJobSite = useMemo(() => {
    if (!activeCheckin) return null;
    const job = assignedJobs.find((j) => j.id === activeCheckin.job_id);
    return job?.site ?? null;
  }, [activeCheckin, assignedJobs]);

  useGeofenceMonitor({
    activeCheckin,
    jobSite: activeJobSite,
    onAutoCheckout: refetch,
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !teamMemberId) {
        setLoading(false);
        return;
      }

      // Fetch pay rate for this team member
      const { data: memberData } = await supabase
        .from("team_members")
        .select("pay_rate")
        .eq("id", teamMemberId)
        .single();
      
      const rate = memberData?.pay_rate ?? null;
      setPayRate(rate);

      // Fetch job IDs from both job_assignments AND timesheet_entries
      const [assignRes, tsEntryRes] = await Promise.all([
        supabase.from("job_assignments").select("job_id").eq("worker_id", teamMemberId),
        supabase.from("timesheet_entries").select("job_id").eq("worker_id", teamMemberId).not("job_id", "is", null),
      ]);

      const jobIdSet = new Set<string>();
      (assignRes.data || []).forEach((a: any) => jobIdSet.add(a.job_id));
      (tsEntryRes.data || []).forEach((e: any) => { if (e.job_id) jobIdSet.add(e.job_id); });

      const jobIds = Array.from(jobIdSet);
      if (!jobIds.length) {
        setAssignedJobs([]);
        setLoading(false);
        return;
      }

      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, title, description, start_date, end_date, status, site_id, job_type, recurring_interval, recurring_end_date, estimated_hours")
        .in("id", jobIds)
        .in("status", ["scheduled", "in_progress"]);

      if (!jobs?.length) {
        setAssignedJobs([]);
        setLoading(false);
        return;
      }

      const siteIds = [...new Set(jobs.map((j: any) => j.site_id))];
      const { data: sites } = await supabase
        .from("job_sites")
        .select("id, name, address, latitude, longitude, geofence_radius")
        .in("id", siteIds);

      const siteMap = new Map((sites || []).map((s: any) => [s.id, s]));
      
      setAssignedJobs(
        jobs.map((j: any) => {
          // Use estimated_hours from the job if set, otherwise estimate from dates
          let expectedHours: number | null = j.estimated_hours ?? null;
          if (expectedHours == null && j.end_date) {
            const diff = new Date(j.end_date).getTime() - new Date(j.start_date).getTime();
            expectedHours = Math.round((diff / (1000 * 60 * 60)) * 10) / 10;
            if (expectedHours > 24) expectedHours = 8; // default for multi-day
          }
          
          return {
            ...j,
            site: siteMap.get(j.site_id) || {
              id: j.site_id, name: "Unknown", address: null,
              latitude: null, longitude: null, geofence_radius: null,
            },
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
    // Only allow check-in on the scheduled date — parse as local to avoid UTC offset issues
    const parseLocal = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
    const startMs = parseLocal(job.start_date).setHours(0,0,0,0);
    const endMs = job.end_date ? parseLocal(job.end_date).setHours(23,59,59,999) : parseLocal(job.start_date).setHours(23,59,59,999);
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
      await checkIn(job.id, job.site.id, lat, lng, job.expectedHours);
    } catch (err: any) {
      toast.error(err.message || "Failed to get GPS location");
    }
    setGpsLoading(null);
  };

  const handleCheckOut = async () => {
    if (!activeCheckin) return;

    // Require before & after photos
    if (!photosComplete) {
      toast.error("Please upload both before and after photos before checking out.");
      return;
    }

    setGpsLoading("checkout");
    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lng } = pos.coords;

      // Check if over expected hours — prompt for explanation
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
    if (!overtimeExplanation.trim()) {
      toast.error("Please provide an explanation for the overtime.");
      return;
    }
    setGpsLoading("checkout");
    await checkOut(activeCheckin.id, pendingCheckoutCoords.lat, pendingCheckoutCoords.lng, overtimeExplanation.trim());
    setOvertimeDialogOpen(false);
    setOvertimeExplanation("");
    setPendingCheckoutCoords(null);
    setGpsLoading(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Jobs</h1>
            <p className="text-sm text-muted-foreground">
              View your schedule, check in, and get directions
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <SignOutIcon className="h-4 w-4 mr-1" />
            Sign Out
          </Button>
        </div>

        <LinkToBusinessCard />

        {activeCheckin && (
          <Card className="border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                <CheckCircle className="h-4 w-4" />
                Currently Checked In
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Since {new Date(activeCheckin.check_in_time).toLocaleTimeString()}
              </div>
              <LiveElapsed since={activeCheckin.check_in_time} />
              {payRate && (
                <div className="text-xs text-muted-foreground">
                  Rate: ${payRate}/hr
                </div>
              )}

              {/* Photo requirements */}
              {activeJobId && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Camera className="h-4 w-4" />
                    Photo Requirements
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className={hasBeforePhotos ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                      {hasBeforePhotos ? "✓" : "✗"} Before photo{hasBeforePhotos ? "" : " required"}
                    </span>
                    <span className={hasAfterPhotos ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                      {hasAfterPhotos ? "✓" : "✗"} After photo{hasAfterPhotos ? "" : " required"}
                    </span>
                  </div>
                  <JobPhotosPanel jobId={activeJobId} compact />
                </div>
              )}

              <Button
                variant="destructive"
                className="w-full"
                onClick={handleCheckOut}
                disabled={gpsLoading === "checkout" || !photosComplete}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {!photosComplete
                  ? "Upload photos to check out"
                  : gpsLoading === "checkout"
                    ? "Getting location…"
                    : "Check Out"}
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-muted-foreground text-center py-12">Loading jobs…</p>
        ) : (
          <Tabs defaultValue="list">
            <TabsList className="w-full">
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
              <CrewJobsList
                jobs={assignedJobs}
                activeCheckin={activeCheckin}
                gpsLoading={gpsLoading}
                onCheckIn={handleCheckIn}
              />
            </TabsContent>
            <TabsContent value="calendar" className="mt-4">
              <CrewCalendarView jobs={assignedJobs} />
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

      <Dialog open={overtimeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setOvertimeDialogOpen(false);
          setOvertimeExplanation("");
          setPendingCheckoutCoords(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Overtime Explanation Required
            </DialogTitle>
            <DialogDescription>
              You've exceeded the scheduled time for this job ({((activeCheckin as any)?.expected_hours || 0).toFixed(1)} hours).
              Please explain why you needed additional time.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. Client requested additional work, weather delay, equipment issues..."
            value={overtimeExplanation}
            onChange={(e) => setOvertimeExplanation(e.target.value)}
            rows={3}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setOvertimeDialogOpen(false);
              setOvertimeExplanation("");
              setPendingCheckoutCoords(null);
            }}>
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
