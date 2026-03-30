import { useState, useCallback, useMemo, useRef } from "react";
import { notifyCrewOfJobChange } from "@/lib/crewJobNotify";
import { useWeatherForecast } from "@/hooks/useWeatherForecast";
import ClientNotifyDialog, { type AffectedClient } from "@/components/team/ClientNotifyDialog";
import type { RebalancePlan } from "@/components/team/RebalancePreviewDialog";
import { getJobDateKeysInRange } from "@/lib/dateOnly";
import JobBudgetFields from "@/components/job/JobBudgetFields";
import CrewAssignmentPanel from "@/components/job/CrewAssignmentPanel";
import { useJobs, type Job, type JobSite } from "@/hooks/useJobs";
import { useClients } from "@/hooks/useClients";
import { useAuth } from "@/hooks/useAuth";
import { useJobTemplates } from "@/hooks/useJobTemplates";
import JobCalendarView, { type JobMoveEvent, type RaincheckResult, type RebalanceResult } from "@/components/team/JobCalendarView";
import { useJobPhotos } from "@/hooks/useJobPhotos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, MapPin, Briefcase, Loader2, Pencil, Trash2, Camera, Calendar, UserCheck, Clock, Wrench, AlertTriangle, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import JobPhotosByDate from "@/components/job/JobPhotosByDate";
import SiteCombobox from "@/components/SiteCombobox";
import ServicesContent from "@/components/team/ServicesContent";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


function DeleteJobDialog({ job, onDelete }: { job: Job; onDelete: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isCompleted = job.status === "completed";

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(job.id);
    setDeleting(false);
    setOpen(false);
    setConfirmed(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmed(false); }}>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isCompleted && <AlertTriangle className="h-5 w-5 text-chart-warning" />}
            Delete Job?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">This will permanently delete "<strong>{job.title}</strong>" and cascade-remove:</span>
            <ul className="list-disc ml-5 space-y-0.5 text-sm">
              <li>All crew assignments</li>
              <li>Timesheet entries (pay totals will be reversed)</li>
              <li>Crew check-in/check-out records</li>
              <li>Job photos</li>
              <li>Linked expenses will be unlinked</li>
              <li>Linked invoices will be unlinked</li>
            </ul>
            {isCompleted && (
              <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-sm font-medium text-destructive mb-2">
                  ⚠️ This job is marked as completed. Deleting it will reverse all pay allocated to crew members for this job.
                </p>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="confirm-delete-completed"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                  />
                  <Label htmlFor="confirm-delete-completed" className="text-sm leading-tight cursor-pointer">
                    I understand the consequences and want to proceed with deletion
                  </Label>
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={deleting || (isCompleted && !confirmed)}
            onClick={handleDelete}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Delete Job
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function JobSchedulerContent() {
  const { user } = useAuth();
  const { sites, jobs, assignments, checkins, loading, createSite, updateSite, deleteSite, createJob, updateJob, updateJobsBatch, deleteJob, assignWorker, removeAssignment, refetch } = useJobs();
  const { data: clients = [] } = useClients();
  const { templates, refetch: refetchTemplates } = useJobTemplates();
  const [tab, setTab] = useState("calendar");

  // Create site state
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [siteState, setSiteState] = useState("");
  const [siteLat, setSiteLat] = useState("");
  const [siteLng, setSiteLng] = useState("");
  const [siteClientId, setSiteClientId] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  // Edit site state
  const [editSiteOpen, setEditSiteOpen] = useState(false);
  const [editSite, setEditSite] = useState<JobSite | null>(null);
  const [editSiteName, setEditSiteName] = useState("");
  const [editSiteAddress, setEditSiteAddress] = useState("");
  const [editSiteCity, setEditSiteCity] = useState("");
  const [editSiteState, setEditSiteState] = useState("");
  const [editSiteLat, setEditSiteLat] = useState("");
  const [editSiteLng, setEditSiteLng] = useState("");
  const [editSiteClientId, setEditSiteClientId] = useState("");

  // Site filter state
  const [siteSearch, setSiteSearch] = useState("");
  const [siteFilterClient, setSiteFilterClient] = useState("all");
  const [siteFilterCity, setSiteFilterCity] = useState("all");
  const [siteFilterState, setSiteFilterState] = useState("all");
  const [siteFilterHasJobs, setSiteFilterHasJobs] = useState(false);

  const [inlineNewSite, setInlineNewSite] = useState(false);
  const [inlineSiteName, setInlineSiteName] = useState("");
  const [inlineSiteAddress, setInlineSiteAddress] = useState("");
  const [inlineSiteCity, setInlineSiteCity] = useState("");
  const [inlineSiteState, setInlineSiteState] = useState("");
  const [inlineSiteLat, setInlineSiteLat] = useState("");
  const [inlineSiteLng, setInlineSiteLng] = useState("");
  const [creatingSiteInline, setCreatingSiteInline] = useState(false);

  // Create job state
  const [jobOpen, setJobOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobSiteId, setJobSiteId] = useState("");
  const [jobClientId, setJobClientId] = useState("");
  const [jobType, setJobType] = useState("one_time");
  const [jobStart, setJobStart] = useState("");
  const [jobEnd, setJobEnd] = useState("");
  const [jobInterval, setJobInterval] = useState("");
  const [jobRecurringEnd, setJobRecurringEnd] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [jobStartTime, setJobStartTime] = useState("");
  const [jobEstHours, setJobEstHours] = useState("");
  const [jobPrice, setJobPrice] = useState("");
  const [jobMaterialBudget, setJobMaterialBudget] = useState("");
  const [jobLaborType, setJobLaborType] = useState("amount");
  const [jobLaborAmount, setJobLaborAmount] = useState("");
  const [jobLaborHours, setJobLaborHours] = useState("");
  const [jobLaborRate, setJobLaborRate] = useState("");
  const [jobBillingInterval, setJobBillingInterval] = useState("");
  const [pendingDefaultCrew, setPendingDefaultCrew] = useState<{ worker_id: string; worker_name: string }[]>([]);

  // Edit job state
  const [editJobOpen, setEditJobOpen] = useState(false);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editJobSiteId, setEditJobSiteId] = useState("");
  const [editJobClientId, setEditJobClientId] = useState("");
  const [editJobType, setEditJobType] = useState("one_time");
  const [editJobStart, setEditJobStart] = useState("");
  const [editJobEnd, setEditJobEnd] = useState("");
  const [editJobInterval, setEditJobInterval] = useState("");
  const [editJobRecurringEnd, setEditJobRecurringEnd] = useState("");
  const [editJobDesc, setEditJobDesc] = useState("");
  const [editJobStartTime, setEditJobStartTime] = useState("");
  const [editJobEstHours, setEditJobEstHours] = useState("");
  const [editJobPrice, setEditJobPrice] = useState("");
  const [editJobMaterialBudget, setEditJobMaterialBudget] = useState("");
  const [editJobLaborType, setEditJobLaborType] = useState("amount");
  const [editJobLaborAmount, setEditJobLaborAmount] = useState("");
  const [editJobLaborHours, setEditJobLaborHours] = useState("");
  const [editJobLaborRate, setEditJobLaborRate] = useState("");
  const [editJobBillingInterval, setEditJobBillingInterval] = useState("");

  // Photos dialog state
  const [photosJobId, setPhotosJobId] = useState<string | null>(null);

  // Fetch team members for crew assignment
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members-for-assign", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("team_members")
        .select("id, name, pay_rate, worker_type")
        .eq("business_user_id", user.id)
        .in("status", ["active", "invited"]);
      return (data || []).map((m) => ({
        id: m.id,
        name: m.name,
        pay_rate: m.pay_rate,
        worker_type: m.worker_type,
      }));
    },
    enabled: !!user,
  });

  // Derived: unique cities and states for site filters
  const siteCities = useMemo(() => {
    const filtered = siteFilterState !== "all" ? sites.filter(s => s.state === siteFilterState) : sites;
    return [...new Set(filtered.map(s => s.city).filter(Boolean) as string[])].sort();
  }, [sites, siteFilterState]);
  const siteStates = useMemo(() => [...new Set(sites.map(s => s.state).filter(Boolean) as string[])].sort(), [sites]);
  const siteIdsWithJobs = useMemo(() => new Set(jobs.map(j => j.site_id)), [jobs]);

  const filteredSites = useMemo(() => {
    return sites.filter(s => {
      if (siteSearch) {
        const q = siteSearch.toLowerCase();
        const match = [s.name, s.address, s.city, s.state, s.zip].some(f => f?.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (siteFilterClient !== "all" && s.client_id !== siteFilterClient) return false;
      if (siteFilterCity !== "all" && s.city !== siteFilterCity) return false;
      if (siteFilterState !== "all" && s.state !== siteFilterState) return false;
      if (siteFilterHasJobs && !siteIdsWithJobs.has(s.id)) return false;
      return true;
    });
  }, [sites, siteSearch, siteFilterClient, siteFilterCity, siteFilterState, siteFilterHasJobs, siteIdsWithJobs]);

  // Helper: get labor summary for a job
  const getLaborSummary = useCallback((job: Job) => {
    const jobAssigns = assignments.filter((a) => a.job_id === job.id);
    // Exclude W-2 (salaried) workers from labor budget calculations
    const contractorAssigns = jobAssigns.filter(a => a.worker_type !== "W2");
    const assignedHrs = contractorAssigns.reduce((s, a) => s + (a.assigned_hours || 0), 0);
    const assignedDollars = contractorAssigns.reduce((s, a) => {
      const member = teamMembers.find((m) => m.id === a.worker_id);
      return s + (a.assigned_hours || 0) * (member?.pay_rate || 0);
    }, 0);
    const budgetHrs = job.labor_budget_type === "hours" ? job.labor_budget_hours : 0;
    const budgetDollars = job.labor_budget_type === "hours"
      ? job.labor_budget_hours * job.labor_budget_rate
      : job.labor_budget_amount;
    const isHoursMode = job.labor_budget_type === "hours";
    const hasBudget = budgetDollars > 0 || budgetHrs > 0;
    const isOver = isHoursMode
      ? assignedHrs > budgetHrs && budgetHrs > 0
      : assignedDollars > budgetDollars && budgetDollars > 0;
    return { assignedHrs, assignedDollars, budgetHrs, budgetDollars, isHoursMode, hasBudget, isOver, crewCount: jobAssigns.length };
  }, [assignments, teamMembers]);

  const geocodeAddress = useCallback(async (address: string, city: string, state: string, setLat: (v: string) => void, setLng: (v: string) => void) => {
    const query = [address, city, state].filter(Boolean).join(", ");
    if (!query.trim()) return;
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { "User-Agent": "LovableApp/1.0" } }
      );
      const data = await res.json();
      if (data?.[0]) {
        setLat(data[0].lat);
        setLng(data[0].lon);
        toast.success("GPS coordinates found");
      } else {
        toast.error("Could not find coordinates for this address");
      }
    } catch {
      toast.error("Geocoding failed");
    } finally {
      setGeocoding(false);
    }
  }, []);

  const resetInlineSite = () => {
    setInlineNewSite(false);
    setInlineSiteName(""); setInlineSiteAddress(""); setInlineSiteCity("");
    setInlineSiteState(""); setInlineSiteLat(""); setInlineSiteLng("");
  };

  const handleCreateSiteInline = async (setSiteIdFn: (id: string) => void) => {
    if (!inlineSiteName.trim()) { toast.error("Site name is required"); return; }
    setCreatingSiteInline(true);
    try {
      // Auto-geocode if address provided but no coords
      let lat = inlineSiteLat ? Number(inlineSiteLat) : null;
      let lng = inlineSiteLng ? Number(inlineSiteLng) : null;
      if (!lat && !lng && (inlineSiteAddress || inlineSiteCity || inlineSiteState)) {
        const query = [inlineSiteAddress, inlineSiteCity, inlineSiteState].filter(Boolean).join(", ");
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
            { headers: { "User-Agent": "LovableApp/1.0" } }
          );
          const data = await res.json();
          if (data?.[0]) {
            lat = Number(data[0].lat);
            lng = Number(data[0].lon);
          }
        } catch { /* geocoding failed, continue without coords */ }
      }
      await createSite({
        name: inlineSiteName, address: inlineSiteAddress || null, city: inlineSiteCity || null,
        state: inlineSiteState || null, zip: null, notes: null,
        latitude: lat, longitude: lng,
        geofence_radius: 150, client_id: null,
      });
      await refetch();
      const { data: newSites } = await supabase
        .from("job_sites").select("id").eq("user_id", user!.id)
        .eq("name", inlineSiteName).order("created_at", { ascending: false }).limit(1);
      if (newSites?.[0]) setSiteIdFn(newSites[0].id);
      resetInlineSite();
      toast.success(lat && lng ? "Site created with GPS coordinates" : "Site created (no GPS coordinates found)");
    } catch { toast.error("Failed to create site"); }
    finally { setCreatingSiteInline(false); }
  };

  const handleCreateSite = async () => {
    if (!siteName.trim()) { toast.error("Name is required"); return; }
    await createSite({
      name: siteName, address: siteAddress || null, city: siteCity || null,
      state: siteState || null, zip: null, notes: null,
      latitude: siteLat ? Number(siteLat) : null,
      longitude: siteLng ? Number(siteLng) : null,
      geofence_radius: 150,
      client_id: siteClientId && siteClientId !== "none" ? siteClientId : null,
    });
    setSiteOpen(false);
    setSiteName(""); setSiteAddress(""); setSiteCity(""); setSiteState("");
    setSiteLat(""); setSiteLng(""); setSiteClientId("");
  };

  const openEditSite = (s: JobSite) => {
    setEditSite(s);
    setEditSiteName(s.name);
    setEditSiteAddress(s.address || "");
    setEditSiteCity(s.city || "");
    setEditSiteState(s.state || "");
    setEditSiteLat(s.latitude != null ? String(s.latitude) : "");
    setEditSiteLng(s.longitude != null ? String(s.longitude) : "");
    setEditSiteClientId(s.client_id || "");
    setEditSiteOpen(true);
  };

  const handleUpdateSite = async () => {
    if (!editSite || !editSiteName.trim()) { toast.error("Name is required"); return; }
    await updateSite(editSite.id, {
      name: editSiteName, address: editSiteAddress || null, city: editSiteCity || null,
      state: editSiteState || null,
      latitude: editSiteLat ? Number(editSiteLat) : null,
      longitude: editSiteLng ? Number(editSiteLng) : null,
      client_id: editSiteClientId && editSiteClientId !== "none" ? editSiteClientId : null,
    });
    setEditSiteOpen(false);
  };

  // Haversine distance in miles between two GPS coordinates
  const haversineDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // Estimate travel time in minutes from distance (miles). Uses ~30 mph avg with 10 min minimum buffer.
  const estimateTravelMinutes = useCallback((miles: number): number => {
    if (miles <= 0) return 10;
    const drivingMinutes = (miles / 30) * 60; // ~30 mph average
    return Math.max(10, Math.ceil(drivingMinutes / 5) * 5); // Round up to nearest 5 min, min 10
  }, []);

  // Check if a job occurs on a given date (handles recurring + multi-day)
  const jobOccursOnDate = useCallback((j: Job, dateStr: string): boolean => {
    if (j.job_type === "recurring" && j.recurring_interval) {
      const keys = getJobDateKeysInRange(j, dateStr, dateStr);
      return keys.includes(dateStr);
    }
    // One-time or multi-day: check if dateStr is within [start_date, end_date]
    if (j.start_date === dateStr) return true;
    if (j.end_date && j.start_date <= dateStr && j.end_date >= dateStr) return true;
    return false;
  }, []);

  // Calculate the earliest valid start time for crew on a given date
  const computeSmartStartTime = useCallback((
    startDate: string,
    newSiteId: string,
    crewIds: string[],
    estimatedHours: number | null,
  ): string | null => {
    if (crewIds.length === 0) return null;

    // Find all jobs on the same date that involve any of the crew members
    const sameDayJobs = jobs.filter(j => {
      if (!j.start_time) return false;
      if (!jobOccursOnDate(j, startDate)) return false;
      // Check if any crew member is assigned to this job
      const jobAssigns = assignments.filter(a => a.job_id === j.id);
      return jobAssigns.some(a => crewIds.includes(a.worker_id));
    });

    if (sameDayJobs.length === 0) return null;

    // Find the latest end time among conflicting jobs
    let latestEndMinutes = 0;
    let latestJobSiteId: string | null = null;

    for (const j of sameDayJobs) {
      if (!j.start_time) continue;
      const [h, m] = j.start_time.split(":").map(Number);
      const startMin = h * 60 + m;
      const durationMin = (j.estimated_hours || 1) * 60;
      const endMin = startMin + durationMin;

      if (endMin > latestEndMinutes) {
        latestEndMinutes = endMin;
        latestJobSiteId = j.site_id;
      }
    }

    if (latestEndMinutes === 0) return null;

    // Calculate travel buffer based on distance between sites
    let travelMinutes = 10; // default buffer
    if (latestJobSiteId && latestJobSiteId !== newSiteId) {
      const prevSite = sites.find(s => s.id === latestJobSiteId);
      const newSite = sites.find(s => s.id === newSiteId);
      if (prevSite?.latitude && prevSite?.longitude && newSite?.latitude && newSite?.longitude) {
        const dist = haversineDistance(prevSite.latitude, prevSite.longitude, newSite.latitude, newSite.longitude);
        travelMinutes = estimateTravelMinutes(dist);
      }
    } else if (latestJobSiteId === newSiteId) {
      travelMinutes = 10; // same site, just a short buffer
    }

    const smartStartMin = latestEndMinutes + travelMinutes;
    // Round to nearest 5 minutes
    const rounded = Math.ceil(smartStartMin / 5) * 5;
    // Cap at 23:55
    const capped = Math.min(rounded, 23 * 60 + 55);
    const hh = String(Math.floor(capped / 60)).padStart(2, "0");
    const mm = String(capped % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }, [jobs, assignments, sites, haversineDistance, estimateTravelMinutes, jobOccursOnDate]);

  // Helper to format time for display
  const formatSmartTime = (time: string) => {
    const [sh, sm] = time.split(":").map(Number);
    const ampm = sh >= 12 ? "PM" : "AM";
    const h12 = sh % 12 || 12;
    return `${h12}:${String(sm).padStart(2, "0")} ${ampm}`;
  };

  // ── Cascade Recalculation ──
  // After any job is created, moved, or edited, recalculate all subsequent crew jobs
  // on the same date to enforce proper travel buffers.
  const cascadeRecalculate = useCallback(async (
    triggerJobId: string,
    dateStr: string,
  ) => {
    // Find all crew assigned to the trigger job
    const triggerAssigns = assignments.filter(a => a.job_id === triggerJobId);
    if (triggerAssigns.length === 0) return;

    const affectedCrewIds = triggerAssigns.map(a => a.worker_id);

    // Refetch to get latest state after the mutation
    await refetch();

    // Re-read jobs (use latest from refetch)
    // We need a small delay for state to settle
    await new Promise(r => setTimeout(r, 300));
  }, [assignments, refetch]);

  // Full cascade that runs on fresh data
  const runCascade = useCallback(async (
    triggerJobId: string,
    dateStr: string,
  ) => {
    const triggerAssigns = assignments.filter(a => a.job_id === triggerJobId);
    if (triggerAssigns.length === 0) return;
    const affectedCrewIds = triggerAssigns.map(a => a.worker_id);

    // Get all jobs on this date that share crew with the trigger job
    const dayJobs = jobs.filter(j => {
      if (!j.start_time) return false;
      if (!jobOccursOnDate(j, dateStr)) return false;
      const jobAssigns = assignments.filter(a => a.job_id === j.id);
      return jobAssigns.some(a => affectedCrewIds.includes(a.worker_id));
    });

    if (dayJobs.length < 2) return;

    // Sort by start time
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const sorted = [...dayJobs].sort((a, b) => toMin(a.start_time!) - toMin(b.start_time!));

    const updates: { id: string; start_time: string; old_time: string; title: string }[] = [];
    let tightBuffers: { jobA: string; jobB: string; gap: number; needed: number }[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      const prevStart = toMin(prev.start_time!);
      const prevDuration = Math.round((prev.estimated_hours || 1) * 60);
      const prevEnd = prevStart + prevDuration;

      // Calculate required travel buffer
      let requiredBuffer = 10;
      if (prev.site_id !== curr.site_id) {
        const prevSite = sites.find(s => s.id === prev.site_id);
        const currSite = sites.find(s => s.id === curr.site_id);
        if (prevSite?.latitude && prevSite?.longitude && currSite?.latitude && currSite?.longitude) {
          const dist = haversineDistance(prevSite.latitude, prevSite.longitude, currSite.latitude, currSite.longitude);
          requiredBuffer = estimateTravelMinutes(dist);
        }
      }

      const earliestStart = prevEnd + requiredBuffer;
      const currStart = toMin(curr.start_time!);
      const actualGap = currStart - prevEnd;

      // Flag tight buffer (gap < required travel time)
      if (actualGap < requiredBuffer && actualGap >= 0) {
        tightBuffers.push({
          jobA: prev.title,
          jobB: curr.title,
          gap: actualGap,
          needed: requiredBuffer,
        });
      }

      // If current job starts before it should (overlap or insufficient buffer)
      if (currStart < earliestStart) {
        const roundedStart = Math.ceil(earliestStart / 5) * 5;
        const cappedStart = Math.min(roundedStart, 23 * 60 + 55);
        const hh = String(Math.floor(cappedStart / 60)).padStart(2, "0");
        const mm = String(cappedStart % 60).padStart(2, "0");
        const newTime = `${hh}:${mm}`;

        if (newTime !== curr.start_time) {
          updates.push({
            id: curr.id,
            start_time: newTime,
            old_time: curr.start_time!,
            title: curr.title,
          });
          // Update the sorted array so subsequent calculations use the new time
          sorted[i] = { ...sorted[i], start_time: newTime };
        }
      }
    }

    // Apply all updates
    if (updates.length > 0) {
      const batchUpdates = updates.map(u => ({
        id: u.id,
        updates: { start_time: u.start_time } as Partial<Job>,
      }));
      await updateJobsBatch(batchUpdates);

      const details = updates.map(u =>
        `• ${u.title}: ${formatSmartTime(u.old_time)} → ${formatSmartTime(u.start_time)}`
      ).join("\n");
      toast.info(
        `Cascade: ${updates.length} job${updates.length > 1 ? "s" : ""} shifted to maintain travel buffers`,
        { description: details, duration: 6000 }
      );
    }

    // Warn about tight buffers that couldn't be auto-fixed (e.g. first job is the problem)
    if (tightBuffers.length > 0 && updates.length === 0) {
      tightBuffers.forEach(tb => {
        toast.warning(
          `Tight buffer: ${tb.gap}min gap between "${tb.jobA}" and "${tb.jobB}" (need ${tb.needed}min for travel)`,
          { duration: 8000 }
        );
      });
    }
  }, [jobs, assignments, sites, haversineDistance, estimateTravelMinutes, jobOccursOnDate, updateJobsBatch, formatSmartTime]);

  // ── Raincheck Day ──
  const handleRaincheckDay = useCallback(async (dateStr: string): Promise<RaincheckResult | null> => {
    const dayJobs = jobs.filter(j => {
      if (j.status === "completed" || j.status === "cancelled") return false;
      if (j.job_type === "recurring") return false;
      return jobOccursOnDate(j, dateStr);
    });
    if (dayJobs.length === 0) {
      toast.info("No eligible jobs to raincheck on this day");
      return null;
    }
    const parseD = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
    const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const candidates: { date: string; hours: number }[] = [];
    for (let i = 1; i <= 14; i++) {
      const cursor = parseD(dateStr);
      cursor.setDate(cursor.getDate() + i);
      const dow = cursor.getDay();
      if (dow >= 1 && dow <= 5) {
        const candDateStr = fmtD(cursor);
        const existingHours = jobs
          .filter(j => j.status !== "cancelled" && jobOccursOnDate(j, candDateStr))
          .reduce((s, j) => s + (j.estimated_hours || 2), 0);
        candidates.push({ date: candDateStr, hours: existingHours });
      }
    }
    candidates.sort((a, b) => a.hours - b.hours);
    const targetDate = candidates[0]?.date;
    if (!targetDate) { toast.error("Could not find an available weekday"); return null; }

    const batchUpdates = dayJobs.map(j => {
      const upd: Record<string, any> = { start_date: targetDate };
      if (j.end_date && j.end_date !== j.start_date) {
        const diffDays = Math.round((parseD(j.end_date).getTime() - parseD(j.start_date).getTime()) / 86400000);
        const newEnd = parseD(targetDate);
        newEnd.setDate(newEnd.getDate() + diffDays);
        upd.end_date = fmtD(newEnd);
      }
      return { id: j.id, updates: upd as Partial<Job> };
    });
    await updateJobsBatch(batchUpdates);

    if (user) {
      for (const j of dayJobs) {
        const workerIds = assignments.filter(a => a.job_id === j.id).map(a => a.worker_id);
        if (workerIds.length > 0) {
          const siteName = sites.find(s => s.id === j.site_id)?.name;
          await notifyCrewOfJobChange(user.id, workerIds, "rescheduled", {
            jobId: j.id, jobTitle: j.title, siteName,
            startDate: targetDate, startTime: j.start_time,
          }, { oldDate: dateStr, oldTime: j.start_time });
        }
      }
    }

    const movedJobs = dayJobs.map(j => ({
      title: j.title,
      clientName: j.client_id ? clients.find(c => c.id === j.client_id)?.name : undefined,
    }));
    const clientJobs = movedJobs.filter(j => j.clientName);
    if (clientJobs.length > 0) {
      const uniqueClients = [...new Set(clientJobs.map(j => j.clientName))];
      toast.info(`📧 Remember to notify ${uniqueClients.length} client${uniqueClients.length !== 1 ? "s" : ""}: ${uniqueClients.join(", ")}`, { duration: 10000 });
    }

    await refetch();
    return { moved: dayJobs.length, targetDate, movedJobs };
  }, [jobs, assignments, sites, clients, user, jobOccursOnDate, updateJobsBatch, refetch]);

  // ── Auto-Rebalance Week ──
  const handleRebalanceWeek = useCallback(async (weekStartStr: string, weekEndStr: string): Promise<RebalanceResult | null> => {
    const parseD = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
    const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const weekStart = parseD(weekStartStr);
    const wDays: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      wDays.push(fmtD(d));
    }

    const dayBuckets = wDays.map(ds => {
      const dJobs = jobs.filter(j => {
        if (j.status === "completed" || j.status === "cancelled") return false;
        if (j.job_type === "recurring") return false;
        return jobOccursOnDate(j, ds);
      });
      return { dateStr: ds, jobs: dJobs, totalHours: dJobs.reduce((s, j) => s + (j.estimated_hours || 2), 0) };
    });

    const workingDays = dayBuckets.slice(0, 5);
    const totalWeekHours = workingDays.reduce((s, b) => s + b.totalHours, 0);
    const activeDayCount = Math.max(1, workingDays.filter(d => d.totalHours > 0).length || 5);
    const targetMax = Math.max(8, (totalWeekHours / activeDayCount) * 1.2);

    const overloaded = workingDays.filter(d => d.totalHours > targetMax);
    if (overloaded.length === 0) {
      toast.info("Schedule looks balanced — no changes needed");
      return null;
    }

    const moves: { jobId: string; title: string; fromDate: string; toDate: string }[] = [];
    const runningHours = new Map(workingDays.map(d => [d.dateStr, d.totalHours]));

    for (const day of overloaded) {
      const sortedJobs = [...day.jobs].sort((a, b) => (b.estimated_hours || 2) - (a.estimated_hours || 2));
      for (const job of sortedJobs) {
        if ((runningHours.get(day.dateStr) || 0) <= targetMax) break;
        const jobHours = job.estimated_hours || 2;
        let bestDay: string | null = null;
        let bestHours = Infinity;
        for (const wd of workingDays) {
          if (wd.dateStr === day.dateStr) continue;
          const wdHours = runningHours.get(wd.dateStr) || 0;
          if (wdHours + jobHours <= targetMax && wdHours < bestHours) {
            bestHours = wdHours;
            bestDay = wd.dateStr;
          }
        }
        if (bestDay) {
          moves.push({ jobId: job.id, title: job.title, fromDate: day.dateStr, toDate: bestDay });
          runningHours.set(day.dateStr, (runningHours.get(day.dateStr) || 0) - jobHours);
          runningHours.set(bestDay, (runningHours.get(bestDay) || 0) + jobHours);
        }
      }
    }

    if (moves.length === 0) {
      toast.info("Schedule is already as balanced as possible");
      return null;
    }

    const batchUpdates = moves.map(m => {
      const job = jobs.find(j => j.id === m.jobId)!;
      const upd: Record<string, any> = { start_date: m.toDate };
      if (job.end_date && job.end_date !== job.start_date) {
        const diffDays = Math.round((parseD(job.end_date).getTime() - parseD(job.start_date).getTime()) / 86400000);
        const newEnd = parseD(m.toDate);
        newEnd.setDate(newEnd.getDate() + diffDays);
        upd.end_date = fmtD(newEnd);
      }
      return { id: m.jobId, updates: upd as Partial<Job> };
    });
    await updateJobsBatch(batchUpdates);

    if (user) {
      for (const m of moves) {
        const job = jobs.find(j => j.id === m.jobId);
        if (!job) continue;
        const workerIds = assignments.filter(a => a.job_id === m.jobId).map(a => a.worker_id);
        if (workerIds.length > 0) {
          const siteName = sites.find(s => s.id === job.site_id)?.name;
          await notifyCrewOfJobChange(user.id, workerIds, "rescheduled", {
            jobId: m.jobId, jobTitle: job.title, siteName,
            startDate: m.toDate, startTime: job.start_time,
          }, { oldDate: m.fromDate, oldTime: job.start_time });
        }
      }
    }

    await refetch();

    const details = moves.map(m => ({
      title: m.title,
      fromDate: parseD(m.fromDate).toLocaleDateString("en-US", { weekday: "short" }),
      toDate: parseD(m.toDate).toLocaleDateString("en-US", { weekday: "short" }),
    }));
    toast.success(`Rebalanced: ${moves.length} job${moves.length !== 1 ? "s" : ""} redistributed`, {
      description: details.map(d => `• ${d.title}: ${d.fromDate} → ${d.toDate}`).join("\n"),
      duration: 8000,
    });
    return { moves: moves.length, details };
  }, [jobs, assignments, sites, user, jobOccursOnDate, updateJobsBatch, refetch]);

  const handleCreateJob = async () => {
    if (!jobTitle.trim() || !jobSiteId || !jobStart) {
      toast.error("Title, site, and start date are required"); return;
    }

    // Always enforce smart scheduling when crew is assigned
    let resolvedStartTime = jobStartTime || null;
    if (pendingDefaultCrew.length > 0) {
      const crewIds = pendingDefaultCrew.map(c => c.worker_id);
      const smart = computeSmartStartTime(jobStart, jobSiteId, crewIds, jobEstHours ? Number(jobEstHours) : null);
      if (smart) {
        if (!resolvedStartTime) {
          // No manual time — auto-set
          resolvedStartTime = smart;
          toast.info(`Start time auto-set to ${formatSmartTime(smart)} based on crew's prior jobs and travel time`);
        } else {
          // Manual time provided — check if it conflicts (starts before crew is available)
          const [mh, mm] = resolvedStartTime.split(":").map(Number);
          const manualMin = mh * 60 + mm;
          const [sh, smm] = smart.split(":").map(Number);
          const smartMin = sh * 60 + smm;
          if (manualMin < smartMin) {
            resolvedStartTime = smart;
            toast.warning(`Start time adjusted to ${formatSmartTime(smart)} — crew isn't available until then (prior job + travel time)`);
          }
        }
      }
    }
    const newJobId = await createJob({
      title: jobTitle, site_id: jobSiteId, start_date: jobStart,
      end_date: jobEnd || null, status: "scheduled", job_type: jobType,
      recurring_interval: jobType === "recurring" ? jobInterval || null : null,
      recurring_end_date: jobType === "recurring" && jobRecurringEnd ? jobRecurringEnd : null,
      billing_interval: jobType === "recurring" && jobBillingInterval && jobBillingInterval !== "none" ? jobBillingInterval : null,
      invoice_id: null, description: jobDesc || null,
      start_time: resolvedStartTime, estimated_hours: jobEstHours ? Number(jobEstHours) : null,
      client_id: jobClientId && jobClientId !== "none" ? jobClientId : null,
      price: Number(jobPrice) || 0,
      material_budget: Number(jobMaterialBudget) || 0,
      labor_budget_type: jobLaborType,
      labor_budget_amount: Number(jobLaborAmount) || 0,
      labor_budget_hours: Number(jobLaborHours) || 0,
      labor_budget_rate: Number(jobLaborRate) || 0,
    });

    // Auto-assign default crew from template
    if (newJobId && pendingDefaultCrew.length > 0) {
      for (const crew of pendingDefaultCrew) {
        const member = teamMembers.find((m) => m.id === crew.worker_id);
        const workerType = member?.worker_type || "1099";
        await assignWorker(newJobId, crew.worker_id, crew.worker_name, workerType, 0, 0, null);
      }
    }

    // Cascade recalculate subsequent jobs on the same day
    if (newJobId && jobStart) {
      await refetch();
      setTimeout(() => runCascade(newJobId, jobStart), 500);
    }

    setJobOpen(false);
    setJobTitle(""); setJobSiteId(""); setJobType("one_time");
    setJobStart(""); setJobEnd(""); setJobInterval(""); setJobDesc("");
    setJobStartTime(""); setJobEstHours(""); setJobClientId("");
    setJobPrice(""); setJobMaterialBudget(""); setJobLaborType("amount");
    setJobLaborAmount(""); setJobLaborHours(""); setJobLaborRate("");
    setJobBillingInterval(""); setPendingDefaultCrew([]);
  };

  const openEditJob = (j: Job) => {
    setEditJob(j);
    setEditJobTitle(j.title);
    setEditJobSiteId(j.site_id);
    setEditJobClientId(j.client_id || "");
    setEditJobType(j.job_type);
    setEditJobStart(j.start_date);
    setEditJobEnd(j.end_date || "");
    setEditJobInterval(j.recurring_interval || "");
    setEditJobRecurringEnd(j.recurring_end_date || "");
    setEditJobDesc(j.description || "");
    setEditJobStartTime(j.start_time || "");
    setEditJobEstHours(j.estimated_hours != null ? String(j.estimated_hours) : "");
    setEditJobPrice(j.price ? String(j.price) : "");
    setEditJobMaterialBudget(j.material_budget ? String(j.material_budget) : "");
    setEditJobLaborType(j.labor_budget_type || "amount");
    setEditJobLaborAmount(j.labor_budget_amount ? String(j.labor_budget_amount) : "");
    setEditJobLaborHours(j.labor_budget_hours ? String(j.labor_budget_hours) : "");
    setEditJobLaborRate(j.labor_budget_rate ? String(j.labor_budget_rate) : "");
    setEditJobBillingInterval(j.billing_interval || "");
    setEditJobOpen(true);
  };

  const handleUpdateJob = async () => {
    if (!editJob || !editJobTitle.trim() || !editJobSiteId || !editJobStart) {
      toast.error("Title, site, and start date are required"); return;
    }
    await updateJob(editJob.id, {
      title: editJobTitle, site_id: editJobSiteId, start_date: editJobStart,
      end_date: editJobEnd || null, job_type: editJobType,
      recurring_interval: editJobType === "recurring" ? editJobInterval || null : null,
      recurring_end_date: editJobType === "recurring" && editJobRecurringEnd ? editJobRecurringEnd : null,
      billing_interval: editJobType === "recurring" && editJobBillingInterval && editJobBillingInterval !== "none" ? editJobBillingInterval : null,
      description: editJobDesc || null,
      start_time: editJobStartTime || null, estimated_hours: editJobEstHours ? Number(editJobEstHours) : null,
      client_id: editJobClientId && editJobClientId !== "none" ? editJobClientId : null,
      price: Number(editJobPrice) || 0,
      material_budget: Number(editJobMaterialBudget) || 0,
      labor_budget_type: editJobLaborType,
      labor_budget_amount: Number(editJobLaborAmount) || 0,
      labor_budget_hours: Number(editJobLaborHours) || 0,
      labor_budget_rate: Number(editJobLaborRate) || 0,
    });
    setEditJobOpen(false);

    // Cascade recalculate on the edited job's date
    if (editJob) {
      const cascadeDate = editJobStart || editJob.start_date;
      await refetch();
      setTimeout(() => runCascade(editJob.id, cascadeDate), 500);
    }
  };

  const siteMap = new Map(sites.map((s) => [s.id, s]));

  const GpsAutoFill = ({ address, city, state, setLat, setLng, lat, lng }: {
    address: string; city: string; state: string;
    setLat: (v: string) => void; setLng: (v: string) => void;
    lat: string; lng: string;
  }) => (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm"
        onClick={() => geocodeAddress(address, city, state, setLat, setLng)}
        disabled={geocoding || (!address && !city)}>
        {geocoding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <MapPin className="h-3.5 w-3.5 mr-1" />}
        {geocoding ? "Looking up…" : "Auto-fill GPS"}
      </Button>
      {lat && lng && (
        <span className="text-xs text-muted-foreground font-mono">
          {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Dialog open={siteOpen} onOpenChange={setSiteOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><MapPin className="h-4 w-4 mr-2" />Add Site</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Job Site</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <Input placeholder="Site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
              <Input placeholder="Address" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="City" value={siteCity} onChange={(e) => setSiteCity(e.target.value)} />
                <Input placeholder="State" value={siteState} onChange={(e) => setSiteState(e.target.value)} />
              </div>
              <GpsAutoFill address={siteAddress} city={siteCity} state={siteState}
                setLat={setSiteLat} setLng={setSiteLng} lat={siteLat} lng={siteLng} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Latitude" type="number" step="any" value={siteLat} onChange={(e) => setSiteLat(e.target.value)} />
                <Input placeholder="Longitude" type="number" step="any" value={siteLng} onChange={(e) => setSiteLng(e.target.value)} />
              </div>
              <Select value={siteClientId} onValueChange={setSiteClientId}>
                <SelectTrigger><UserCheck className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="Link to client (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="w-full" onClick={handleCreateSite}>Create Site</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={jobOpen} onOpenChange={setJobOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />New Job</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Schedule Job</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              {templates.length > 0 && (
                <Select value="" onValueChange={(templateId) => {
                  const t = templates.find((x) => x.id === templateId);
                  if (!t) return;
                  setJobTitle(t.title);
                  setJobDesc(t.description || "");
                  setJobEstHours(t.estimated_hours ? String(t.estimated_hours) : "");
                  setJobPrice(t.price ? String(t.price) : "");
                  setJobMaterialBudget(t.material_budget ? String(t.material_budget) : "");
                  setJobLaborType(t.labor_budget_type);
                  setJobLaborAmount(t.labor_budget_amount ? String(t.labor_budget_amount) : "");
                  setJobLaborHours(t.labor_budget_hours ? String(t.labor_budget_hours) : "");
                  setJobLaborRate(t.labor_budget_rate ? String(t.labor_budget_rate) : "");
                  if (t.recurrence_interval) {
                    setJobType("recurring");
                    setJobInterval(t.recurrence_interval);
                  }
                  setJobBillingInterval(t.billing_interval || "");
                  setPendingDefaultCrew(t.default_crew || []);
                }}>
                  <SelectTrigger className="border-dashed">
                    <Briefcase className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Use a service template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}{t.price > 0 ? ` — $${t.price}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              <Input placeholder="Description (optional)" value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} />
              <Select value={jobClientId} onValueChange={(v) => { setJobClientId(v); setJobSiteId(""); }}>
                <SelectTrigger><UserCheck className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="Select client (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {!inlineNewSite ? (
                <SiteCombobox
                  sites={sites}
                  value={jobSiteId}
                  onSelect={(v) => setJobSiteId(v)}
                  onAddNew={() => setInlineNewSite(true)}
                  clientId={jobClientId && jobClientId !== "none" ? jobClientId : undefined}
                />
              ) : (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">New Site</p>
                  <Input placeholder="Site name *" value={inlineSiteName} onChange={(e) => setInlineSiteName(e.target.value)} />
                  <Input placeholder="Address" value={inlineSiteAddress} onChange={(e) => setInlineSiteAddress(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="City" value={inlineSiteCity} onChange={(e) => setInlineSiteCity(e.target.value)} />
                    <Input placeholder="State" value={inlineSiteState} onChange={(e) => setInlineSiteState(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" disabled={creatingSiteInline} onClick={() => handleCreateSiteInline(setJobSiteId)}>
                      {creatingSiteInline ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                      Create Site
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetInlineSite}>Cancel</Button>
                  </div>
                </div>
              )}
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                  <SelectItem value="multi_day">Multi-day</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={jobStart} onChange={(e) => setJobStart(e.target.value)} />
                <Input type="date" value={jobEnd} onChange={(e) => setJobEnd(e.target.value)} placeholder="End date" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Start Time</label>
                  <Input type="time" value={jobStartTime} onChange={(e) => setJobStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Est. Hours</label>
                  <Input type="number" min="0.5" step="0.5" placeholder="e.g. 4" value={jobEstHours} onChange={(e) => setJobEstHours(e.target.value)} />
                </div>
              </div>
              {jobType === "recurring" && (
                <>
                  <Select value={jobInterval} onValueChange={setJobInterval}>
                    <SelectTrigger><SelectValue placeholder="Repeat interval" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="biannual">Bi-annual</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                  <div>
                    <label className="text-xs text-muted-foreground">Recurring End Date (optional)</label>
                    <Input type="date" value={jobRecurringEnd} onChange={(e) => setJobRecurringEnd(e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-0.5">Leave blank to repeat indefinitely</p>
                   </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Billing Rate</label>
                    <Select value={jobBillingInterval} onValueChange={setJobBillingInterval}>
                      <SelectTrigger><SelectValue placeholder="Same as recurrence" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Same as recurrence</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="biannual">Bi-annual</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-0.5">How often to bill (if different from service frequency)</p>
                  </div>
                </>
              )}
              <JobBudgetFields
                price={jobPrice} materialBudget={jobMaterialBudget}
                laborBudgetType={jobLaborType} laborBudgetAmount={jobLaborAmount}
                laborBudgetHours={jobLaborHours} laborBudgetRate={jobLaborRate}
                onPriceChange={setJobPrice} onMaterialBudgetChange={setJobMaterialBudget}
                onLaborBudgetTypeChange={setJobLaborType} onLaborBudgetAmountChange={setJobLaborAmount}
                onLaborBudgetHoursChange={setJobLaborHours} onLaborBudgetRateChange={setJobLaborRate}
              />
              <Button className="w-full" onClick={handleCreateJob}>Create Job</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Site Dialog */}
      <Dialog open={editSiteOpen} onOpenChange={setEditSiteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Job Site</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Site name" value={editSiteName} onChange={(e) => setEditSiteName(e.target.value)} />
            <Input placeholder="Address" value={editSiteAddress} onChange={(e) => setEditSiteAddress(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="City" value={editSiteCity} onChange={(e) => setEditSiteCity(e.target.value)} />
              <Input placeholder="State" value={editSiteState} onChange={(e) => setEditSiteState(e.target.value)} />
            </div>
            <GpsAutoFill address={editSiteAddress} city={editSiteCity} state={editSiteState}
              setLat={setEditSiteLat} setLng={setEditSiteLng} lat={editSiteLat} lng={editSiteLng} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Latitude" type="number" step="any" value={editSiteLat} onChange={(e) => setEditSiteLat(e.target.value)} />
              <Input placeholder="Longitude" type="number" step="any" value={editSiteLng} onChange={(e) => setEditSiteLng(e.target.value)} />
            </div>
            <Select value={editSiteClientId} onValueChange={setEditSiteClientId}>
              <SelectTrigger><UserCheck className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="Link to client (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={handleUpdateSite}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Job Dialog */}
      <Dialog open={editJobOpen} onOpenChange={setEditJobOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Job</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Job title" value={editJobTitle} onChange={(e) => setEditJobTitle(e.target.value)} />
            <Input placeholder="Description (optional)" value={editJobDesc} onChange={(e) => setEditJobDesc(e.target.value)} />
            <Select value={editJobClientId} onValueChange={(v) => { setEditJobClientId(v); setEditJobSiteId(""); }}>
              <SelectTrigger><UserCheck className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="Select client (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!inlineNewSite ? (
              <SiteCombobox
                sites={sites}
                value={editJobSiteId}
                onSelect={(v) => setEditJobSiteId(v)}
                onAddNew={() => setInlineNewSite(true)}
                clientId={editJobClientId && editJobClientId !== "none" ? editJobClientId : undefined}
              />
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">New Site</p>
                <Input placeholder="Site name *" value={inlineSiteName} onChange={(e) => setInlineSiteName(e.target.value)} />
                <Input placeholder="Address" value={inlineSiteAddress} onChange={(e) => setInlineSiteAddress(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="City" value={inlineSiteCity} onChange={(e) => setInlineSiteCity(e.target.value)} />
                  <Input placeholder="State" value={inlineSiteState} onChange={(e) => setInlineSiteState(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={creatingSiteInline} onClick={() => handleCreateSiteInline(setEditJobSiteId)}>
                    {creatingSiteInline ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                    Create Site
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetInlineSite}>Cancel</Button>
                </div>
              </div>
            )}
            <Select value={editJobType} onValueChange={setEditJobType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
                <SelectItem value="multi_day">Multi-day</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Start</label>
                <Input type="date" value={editJobStart} onChange={(e) => setEditJobStart(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">End</label>
                <Input type="date" value={editJobEnd} onChange={(e) => setEditJobEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Start Time</label>
                <Input type="time" value={editJobStartTime} onChange={(e) => setEditJobStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Est. Hours</label>
                <Input type="number" min="0.5" step="0.5" placeholder="e.g. 4" value={editJobEstHours} onChange={(e) => setEditJobEstHours(e.target.value)} />
              </div>
            </div>
            {editJobType === "recurring" && (
              <>
                <Select value={editJobInterval} onValueChange={setEditJobInterval}>
                  <SelectTrigger><SelectValue placeholder="Repeat interval" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="biannual">Bi-annual</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
                <div>
                  <label className="text-xs text-muted-foreground">Recurring End Date (optional)</label>
                  <Input type="date" value={editJobRecurringEnd} onChange={(e) => setEditJobRecurringEnd(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-0.5">Leave blank to repeat indefinitely</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Billing Rate</label>
                  <Select value={editJobBillingInterval} onValueChange={setEditJobBillingInterval}>
                    <SelectTrigger><SelectValue placeholder="Same as recurrence" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Same as recurrence</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="biannual">Bi-annual</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-0.5">How often to bill (if different from service frequency)</p>
                </div>
              </>
            )}
            <JobBudgetFields
              price={editJobPrice} materialBudget={editJobMaterialBudget}
              laborBudgetType={editJobLaborType} laborBudgetAmount={editJobLaborAmount}
              laborBudgetHours={editJobLaborHours} laborBudgetRate={editJobLaborRate}
              onPriceChange={setEditJobPrice} onMaterialBudgetChange={setEditJobMaterialBudget}
              onLaborBudgetTypeChange={setEditJobLaborType} onLaborBudgetAmountChange={setEditJobLaborAmount}
              onLaborBudgetHoursChange={setEditJobLaborHours} onLaborBudgetRateChange={setEditJobLaborRate}
            />
            {editJob && (
              <CrewAssignmentPanel
                job={editJob}
                assignments={assignments}
                teamMembers={teamMembers}
                allJobs={jobs}
                onAssign={async (wId, wName, wType, totalHrs, hpd, days) => {
                  await assignWorker(editJob.id, wId, wName, wType, totalHrs, hpd, days);
                  // Dispatch notification to assigned crew member
                  try {
                    const { data: member } = await supabase
                      .from("team_members")
                      .select("member_user_id")
                      .eq("id", wId)
                      .not("member_user_id", "is", null)
                      .single();
                    if (member?.member_user_id) {
                      await supabase.from("notifications").insert({
                        user_id: member.member_user_id,
                        title: `New Assignment: ${editJob.title}`,
                        message: `You've been assigned to "${editJob.title}" on ${editJob.start_date}${editJob.start_time ? ' at ' + editJob.start_time : ''}.`,
                        type: "dispatch",
                        metadata: { job_id: editJob.id },
                      });
                    }
                  } catch (err) {
                    console.error("Failed to send assignment notification:", err);
                  }
                }}
                onRemove={async (aId) => {
                  await removeAssignment(aId);
                }}
              />
            )}
            <Button className="w-full" onClick={handleUpdateJob}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v !== "services") refetchTemplates(); }}>
        <TabsList>
          <TabsTrigger value="calendar"><Calendar className="h-3.5 w-3.5 mr-1" />Calendar</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="services"><Wrench className="h-3.5 w-3.5 mr-1" />Services</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="mt-4">
          <JobCalendarView
            jobs={jobs}
            sites={sites}
            assignments={assignments}
            checkins={checkins}
            teamMembers={teamMembers}
            onJobClick={(j) => openEditJob(j)}
            onJobDelete={deleteJob}
            onRaincheckDay={handleRaincheckDay}
            onRebalanceWeek={handleRebalanceWeek}
            onJobMove={async (evt: JobMoveEvent) => {
              const { jobId, newDate, newTime, fromDate, dropIndex, recurringMode, sourceJob, instanceDate } = evt;
              const parseD = (s: string) => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
              const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
              const toMinutes = (time?: string | null) => {
                if (!time) return Number.MAX_SAFE_INTEGER;
                const [h, m] = time.split(":").map(Number);
                return h * 60 + m;
              };
              const toTimeString = (minutes: number) => {
                const safeMinutes = ((Math.round(minutes) % 1440) + 1440) % 1440;
                return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
              };

              // Helper: send dispatch notifications to assigned crew
              const notifyAssignedCrew = async (targetJobId: string, jobTitle: string, message: string) => {
                if (!user) return;
                const jobAssigns = assignments.filter((a) => a.job_id === targetJobId);
                const crewMemberIds = jobAssigns
                  .map((a) => teamMembers.find((tm) => tm.id === a.worker_id))
                  .filter(Boolean);
                // Get member_user_ids from team_members table
                if (crewMemberIds.length === 0) return;
                try {
                  const { data: members } = await supabase
                    .from("team_members")
                    .select("member_user_id")
                    .in("id", crewMemberIds.map((m) => m!.id))
                    .not("member_user_id", "is", null);
                  if (members && members.length > 0) {
                    const notifications = members.map((m) => ({
                      user_id: m.member_user_id!,
                      title: `Schedule Update: ${jobTitle}`,
                      message,
                      type: "dispatch",
                      metadata: { job_id: targetJobId } as any,
                    }));
                    await supabase.from("notifications").insert(notifications);
                  }
                } catch (err) {
                  console.error("Failed to send dispatch notifications:", err);
                }
              };

              // Recurring: "this instance only" — create a one-time copy
              if (recurringMode === "this" && sourceJob) {
                const rescheduledTag = `[rescheduled:${sourceJob.id}:${instanceDate || ""}]`;
                const newJob: any = {
                  title: sourceJob.title,
                  description: rescheduledTag + (sourceJob.description ? "\n" + sourceJob.description : ""),
                  site_id: sourceJob.site_id,
                  client_id: sourceJob.client_id,
                  start_date: newDate,
                  start_time: newTime ?? sourceJob.start_time,
                  estimated_hours: sourceJob.estimated_hours,
                  price: sourceJob.price,
                  material_budget: sourceJob.material_budget,
                  labor_budget_type: sourceJob.labor_budget_type,
                  labor_budget_amount: sourceJob.labor_budget_amount,
                  labor_budget_hours: sourceJob.labor_budget_hours,
                  labor_budget_rate: sourceJob.labor_budget_rate,
                  job_type: "one_time",
                  status: sourceJob.status,
                };
                await createJob(newJob);
                const formattedDate = parseD(newDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                toast.success(`"${sourceJob.title}" rescheduled to ${formattedDate}`);
                await notifyAssignedCrew(sourceJob.id, sourceJob.title, `This job has been rescheduled to ${formattedDate}.`);
                await refetch();
                setTimeout(() => runCascade(sourceJob.id, newDate), 500);
                return;
              }

              // Recurring: "all future" — update the recurring job start date
              if (recurringMode === "all" && sourceJob) {
                const updates: Record<string, any> = { start_date: newDate };
                if (newTime !== undefined) updates.start_time = newTime;
                await updateJob(jobId, updates);
                toast.success(`All future instances of "${sourceJob.title}" shifted`);
                await notifyAssignedCrew(jobId, sourceJob.title, `All future instances have been rescheduled starting ${parseD(newDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}.`);
                return;
              }

              // Normal (non-recurring) move / intra-day resequence
              const job = jobs.find((j) => j.id === jobId);
              if (!job) return;

              const isSameDayReorder = !!fromDate && fromDate === newDate && typeof dropIndex === "number";
              if (isSameDayReorder) {
                const sameDayJobs = jobs
                  .filter((j) => j.start_date === newDate && j.status !== "cancelled" && j.id !== jobId)
                  .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

                const insertAt = Math.max(0, Math.min(dropIndex, sameDayJobs.length));
                const previousJob = insertAt > 0 ? sameDayJobs[insertAt - 1] : null;
                const nextJob = insertAt < sameDayJobs.length ? sameDayJobs[insertAt] : null;

                let computedTime = newTime ?? job.start_time ?? "08:00";

                // Calculate travel-aware buffer between previous job and moved job
                const getTravelBuf = (fromSiteId: string, toSiteId: string) => {
                  if (fromSiteId === toSiteId) return 10;
                  const fromSite = sites.find(s => s.id === fromSiteId);
                  const toSite = sites.find(s => s.id === toSiteId);
                  if (fromSite?.latitude && fromSite?.longitude && toSite?.latitude && toSite?.longitude) {
                    const dist = haversineDistance(fromSite.latitude, fromSite.longitude, toSite.latitude, toSite.longitude);
                    return estimateTravelMinutes(dist);
                  }
                  return 10;
                };

                if (previousJob?.start_time && nextJob?.start_time) {
                  const previousStart = toMinutes(previousJob.start_time);
                  const previousDuration = Math.max(30, Math.round((previousJob.estimated_hours || 1) * 60));
                  const bufferAfterPrev = getTravelBuf(previousJob.site_id, job.site_id);
                  const earliestStart = previousStart + previousDuration + bufferAfterPrev;
                  const nextStart = toMinutes(nextJob.start_time);
                  const movedDuration = Math.max(30, Math.round((job.estimated_hours || 1) * 60));
                  const bufferBeforeNext = getTravelBuf(job.site_id, nextJob.site_id);
                  const latestStart = nextStart - movedDuration - bufferBeforeNext;
                  computedTime = toTimeString(Math.min(Math.max(earliestStart, previousStart), Math.max(latestStart, earliestStart)));
                } else if (previousJob?.start_time) {
                  const previousStart = toMinutes(previousJob.start_time);
                  const previousDuration = Math.max(30, Math.round((previousJob.estimated_hours || 1) * 60));
                  const bufferAfterPrev = getTravelBuf(previousJob.site_id, job.site_id);
                  computedTime = toTimeString(previousStart + previousDuration + bufferAfterPrev);
                } else if (nextJob?.start_time) {
                  const nextStart = toMinutes(nextJob.start_time);
                  const movedDuration = Math.max(30, Math.round((job.estimated_hours || 1) * 60));
                  const bufferBeforeNext = getTravelBuf(job.site_id, nextJob.site_id);
                  computedTime = toTimeString(Math.max(0, nextStart - movedDuration - bufferBeforeNext));
                }

                const updates: Record<string, any> = { start_date: newDate, start_time: computedTime };
                await updateJob(jobId, updates);
                toast.success(`"${job.title}" moved to ${computedTime}`);
                await notifyAssignedCrew(jobId, job.title, `Your job time has been updated to ${computedTime}.`);
                await refetch();
                setTimeout(() => runCascade(jobId, newDate), 500);
                return;
              }

              // Cross-day move: use computeSmartStartTime for crew-aware travel scheduling
              const updates: Record<string, any> = { start_date: newDate };
              let resolvedTime = newTime !== undefined && newTime !== null ? newTime : null;

              // Apply smart scheduling based on crew assignments + travel distance
              const jobCrewIds = assignments.filter(a => a.job_id === jobId).map(a => a.worker_id);
              if (jobCrewIds.length > 0) {
                const smart = computeSmartStartTime(newDate, job.site_id, jobCrewIds, job.estimated_hours);
                if (smart) {
                  if (!resolvedTime) {
                    resolvedTime = smart;
                  } else {
                    // Check if the proposed time is earlier than crew availability
                    const [rh, rm] = resolvedTime.split(":").map(Number);
                    const [sh, sm] = smart.split(":").map(Number);
                    if (rh * 60 + rm < sh * 60 + sm) {
                      resolvedTime = smart;
                      toast.warning(`Start time adjusted to ${formatSmartTime(smart)} — crew isn't available until then (prior job + travel time)`);
                    }
                  }
                }
              }

              if (resolvedTime) updates.start_time = resolvedTime;

              if (job.end_date && newDate !== job.start_date) {
                const diffDays = Math.round((parseD(job.end_date).getTime() - parseD(job.start_date).getTime()) / 86400000);
                const newEnd = parseD(newDate);
                newEnd.setDate(newEnd.getDate() + diffDays);
                updates.end_date = fmtD(newEnd);
              }
              await updateJob(jobId, updates);
              const formattedDate = parseD(newDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              toast.success(`"${job.title}" ${resolvedTime ? 'rescheduled' : 'moved'} to ${formattedDate}${resolvedTime ? ' at ' + resolvedTime : ''}`);
              await notifyAssignedCrew(jobId, job.title, `This job has been ${resolvedTime ? 'rescheduled' : 'moved'} to ${formattedDate}${resolvedTime ? ' at ' + resolvedTime : ''}.`);
              await refetch();
              setTimeout(() => runCascade(jobId, newDate), 500);
            }}
            onDiscardEdits={async (revertData) => {
              for (const { jobId, updates } of revertData) {
                await updateJob(jobId, updates);
              }
            }}
          />
        </TabsContent>
        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading…</p>
              ) : jobs.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground">No jobs scheduled</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Labor Budget</TableHead>
                      <TableHead>Crew</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Photos</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => {
                      const labor = getLaborSummary(j);
                      return (
                      <TableRow key={j.id}>
                        <TableCell className="font-medium">{j.title}</TableCell>
                        <TableCell>{siteMap.get(j.site_id)?.name || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {j.price > 0 ? `$${j.price.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell>
                          {labor.hasBudget ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className={cn(
                                "text-xs font-mono",
                                labor.isOver ? "text-destructive font-semibold" : labor.assignedHrs >= (labor.budgetHrs || Infinity) * 0.8 ? "text-chart-warning" : "text-chart-positive"
                              )}>
                                {labor.isHoursMode
                                  ? `${labor.assignedHrs}/${labor.budgetHrs}h`
                                  : `$${labor.assignedDollars.toFixed(0)}/$${labor.budgetDollars.toFixed(0)}`}
                              </span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {labor.crewCount > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">{labor.crewCount} crew</Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{j.job_type}</Badge></TableCell>
                        <TableCell>{j.start_date}</TableCell>
                        <TableCell>
{j.job_type === "recurring" ? (
                          <Badge variant="secondary">scheduled</Badge>
                        ) : (
                          <Select value={j.status} onValueChange={(v) => updateJob(j.id, { status: v })}>
                            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="scheduled">Scheduled</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => setPhotosJobId(j.id)}
                          >
                            <Camera className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditJob(j)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <DeleteJobDialog job={j} onDelete={deleteJob} />
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="sites" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sites…"
                    value={siteSearch}
                    onChange={e => setSiteSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={siteFilterClient} onValueChange={setSiteFilterClient}>
                  <SelectTrigger className="w-[150px] h-9">
                    <SelectValue placeholder="Client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={siteFilterState} onValueChange={(v) => { setSiteFilterState(v); setSiteFilterCity("all"); }}>
                  <SelectTrigger className="w-[120px] h-9">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {siteStates.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {siteFilterState !== "all" && (
                  <Select value={siteFilterCity} onValueChange={setSiteFilterCity}>
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder="City" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cities</SelectItem>
                      {siteCities.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex items-center gap-2">
                  <Switch id="has-jobs" checked={siteFilterHasJobs} onCheckedChange={setSiteFilterHasJobs} />
                  <Label htmlFor="has-jobs" className="text-sm cursor-pointer whitespace-nowrap">Has jobs</Label>
                </div>
              </div>

              {filteredSites.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground">
                    {sites.length === 0 ? "No sites added yet" : "No sites match your filters"}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                     <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>GPS</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSites.map((s) => {
                      const linkedClient = clients.find(c => c.id === s.client_id);
                      return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>
                          {linkedClient ? (
                            <Badge variant="secondary" className="text-xs"><UserCheck className="h-3 w-3 mr-1" />{linkedClient.name}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>{s.address || "—"}</TableCell>
                        <TableCell>{s.city || "—"}{s.state ? `, ${s.state}` : ""}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.latitude != null ? `${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}` : "Not set"}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditSite(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Site?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete "{s.name}". Jobs using this site must be reassigned first.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteSite(s.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="services" className="mt-4">
          <ServicesContent />
        </TabsContent>
      </Tabs>

      {/* Photos Dialog */}
      <Dialog open={!!photosJobId} onOpenChange={(open) => { if (!open) setPhotosJobId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Job Photos — {photosJobId ? jobs.find(j => j.id === photosJobId)?.title : ""}
            </DialogTitle>
          </DialogHeader>
          {photosJobId && <JobPhotosByDate jobId={photosJobId} jobType={jobs.find(j => j.id === photosJobId)?.job_type} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
