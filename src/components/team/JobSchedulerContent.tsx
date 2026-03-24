import { useState, useCallback, useMemo } from "react";
import JobBudgetFields from "@/components/job/JobBudgetFields";
import CrewAssignmentPanel from "@/components/job/CrewAssignmentPanel";
import { useJobs, type Job, type JobSite } from "@/hooks/useJobs";
import { useClients } from "@/hooks/useClients";
import { useAuth } from "@/hooks/useAuth";
import { useJobTemplates } from "@/hooks/useJobTemplates";
import JobCalendarView, { type JobMoveEvent } from "@/components/team/JobCalendarView";
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
import { Plus, MapPin, Briefcase, Loader2, Pencil, Trash2, Camera, Calendar, UserCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import JobPhotosByDate from "@/components/job/JobPhotosByDate";

export default function JobSchedulerContent() {
  const { user } = useAuth();
  const { sites, jobs, assignments, checkins, loading, createSite, updateSite, deleteSite, createJob, updateJob, updateJobsBatch, deleteJob, assignWorker, removeAssignment, refetch } = useJobs();
  const { data: clients = [] } = useClients();
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

  // Inline new site state (used inside job dialogs)
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

  const handleCreateJob = async () => {
    if (!jobTitle.trim() || !jobSiteId || !jobStart) {
      toast.error("Title, site, and start date are required"); return;
    }
    await createJob({
      title: jobTitle, site_id: jobSiteId, start_date: jobStart,
      end_date: jobEnd || null, status: "scheduled", job_type: jobType,
      recurring_interval: jobType === "recurring" ? jobInterval || null : null,
      recurring_end_date: jobType === "recurring" && jobRecurringEnd ? jobRecurringEnd : null, invoice_id: null, description: jobDesc || null,
      start_time: jobStartTime || null, estimated_hours: jobEstHours ? Number(jobEstHours) : null,
      client_id: jobClientId && jobClientId !== "none" ? jobClientId : null,
      price: Number(jobPrice) || 0,
      material_budget: Number(jobMaterialBudget) || 0,
      labor_budget_type: jobLaborType,
      labor_budget_amount: Number(jobLaborAmount) || 0,
      labor_budget_hours: Number(jobLaborHours) || 0,
      labor_budget_rate: Number(jobLaborRate) || 0,
    });
    setJobOpen(false);
    setJobTitle(""); setJobSiteId(""); setJobType("one_time");
    setJobStart(""); setJobEnd(""); setJobInterval(""); setJobDesc("");
    setJobStartTime(""); setJobEstHours(""); setJobClientId("");
    setJobPrice(""); setJobMaterialBudget(""); setJobLaborType("amount");
    setJobLaborAmount(""); setJobLaborHours(""); setJobLaborRate("");
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
              <Input placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              <Input placeholder="Description (optional)" value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} />
              {!inlineNewSite ? (
                <Select value={jobSiteId} onValueChange={(v) => {
                  if (v === "__new__") { setInlineNewSite(true); return; }
                  setJobSiteId(v);
                  const site = sites.find(s => s.id === v);
                  if (site?.client_id && !jobClientId) setJobClientId(site.client_id);
                }}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    <SelectItem value="__new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add New Site</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
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
              <Select value={jobClientId} onValueChange={setJobClientId}>
                <SelectTrigger><UserCheck className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="Link to client (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
                      <SelectItem value="biweekly">Biweekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                  <div>
                    <label className="text-xs text-muted-foreground">Recurring End Date (optional)</label>
                    <Input type="date" value={jobRecurringEnd} onChange={(e) => setJobRecurringEnd(e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-0.5">Leave blank to repeat indefinitely</p>
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
            {!inlineNewSite ? (
              <Select value={editJobSiteId} onValueChange={(v) => {
                if (v === "__new__") { setInlineNewSite(true); return; }
                setEditJobSiteId(v);
              }}>
                <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                <SelectContent>
                  {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  <SelectItem value="__new__" className="text-primary font-medium">
                    <span className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add New Site</span>
                  </SelectItem>
                </SelectContent>
              </Select>
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
            <Select value={editJobClientId} onValueChange={setEditJobClientId}>
              <SelectTrigger><UserCheck className="h-3.5 w-3.5 mr-2" /><SelectValue placeholder="Link to client (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <div>
                  <label className="text-xs text-muted-foreground">Recurring End Date (optional)</label>
                  <Input type="date" value={editJobRecurringEnd} onChange={(e) => setEditJobRecurringEnd(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-0.5">Leave blank to repeat indefinitely</p>
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="calendar"><Calendar className="h-3.5 w-3.5 mr-1" />Calendar</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="mt-4">
          <JobCalendarView
            jobs={jobs}
            sites={sites}
            assignments={assignments}
            checkins={checkins}
            teamMembers={teamMembers}
            onJobClick={(j) => openEditJob(j)}
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

                if (previousJob?.start_time && nextJob?.start_time) {
                  const previousStart = toMinutes(previousJob.start_time);
                  const previousDuration = Math.max(30, Math.round((previousJob.estimated_hours || 1) * 60));
                  const earliestStart = previousStart + previousDuration;
                  const nextStart = toMinutes(nextJob.start_time);
                  const movedDuration = Math.max(30, Math.round((job.estimated_hours || 1) * 60));
                  const latestStart = nextStart - movedDuration;
                  computedTime = toTimeString(Math.min(Math.max(earliestStart, previousStart), latestStart));
                } else if (previousJob?.start_time) {
                  const previousStart = toMinutes(previousJob.start_time);
                  const previousDuration = Math.max(30, Math.round((previousJob.estimated_hours || 1) * 60));
                  computedTime = toTimeString(previousStart + previousDuration);
                } else if (nextJob?.start_time) {
                  const nextStart = toMinutes(nextJob.start_time);
                  const movedDuration = Math.max(30, Math.round((job.estimated_hours || 1) * 60));
                  computedTime = toTimeString(Math.max(0, nextStart - movedDuration));
                }

                const updates: Record<string, any> = { start_date: newDate, start_time: computedTime };
                await updateJob(jobId, updates);
                toast.success(`"${job.title}" moved to ${computedTime}`);
                await notifyAssignedCrew(jobId, job.title, `Your job time has been updated to ${computedTime}.`);
                return;
              }

              const updates: Record<string, any> = { start_date: newDate };
              if (newTime !== undefined && newTime !== null) {
                updates.start_time = newTime;
              }
              if (job.end_date && newDate !== job.start_date) {
                const diffDays = Math.round((parseD(job.end_date).getTime() - parseD(job.start_date).getTime()) / 86400000);
                const newEnd = parseD(newDate);
                newEnd.setDate(newEnd.getDate() + diffDays);
                updates.end_date = fmtD(newEnd);
              }
              await updateJob(jobId, updates);
              const formattedDate = parseD(newDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              toast.success(`"${job.title}" ${newTime ? 'rescheduled' : 'moved'} to ${formattedDate}${newTime ? ' at ' + newTime : ''}`);
              await notifyAssignedCrew(jobId, job.title, `This job has been ${newTime ? 'rescheduled' : 'moved'} to ${formattedDate}${newTime ? ' at ' + newTime : ''}.`);
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
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Job?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete "{j.title}" and all its assignments.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteJob(j.id)}>Delete</AlertDialogAction>
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
        <TabsContent value="sites" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {sites.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground">No sites added yet</p>
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
                    {sites.map((s) => {
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
