import { useState, useCallback, useMemo } from "react";
import { useJobs, type Job, type JobSite } from "@/hooks/useJobs";
import { type Client } from "@/hooks/useClients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty, CommandGroup } from "@/components/ui/command";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, MapPin, Briefcase, Loader2, Trash2, Calendar, Clock, Link2, Unlink, DollarSign } from "lucide-react";
import { toast } from "sonner";
import JobBudgetFields, { getExpectedProfit } from "@/components/job/JobBudgetFields";
import SiteCombobox from "@/components/SiteCombobox";

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  scheduled: "default",
  in_progress: "secondary",
  completed: "outline",
  cancelled: "destructive",
};

interface Props {
  client: Client;
}

export default function ClientJobsPanel({ client }: Props) {
  const { sites, jobs, createSite, createJob, updateJob, deleteJob, refetch } = useJobs();

  // Jobs linked to this client
  const clientJobs = jobs.filter((j) => j.client_id === client.id);
  // Sites linked to this client
  const clientSites = sites.filter((s) => s.client_id === client.id);

  const siteMap = new Map(sites.map((s) => [s.id, s]));

  // Create job dialog
  const [jobOpen, setJobOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [jobType, setJobType] = useState("one_time");
  const [jobStart, setJobStart] = useState("");
  const [jobEnd, setJobEnd] = useState("");
  const [jobInterval, setJobInterval] = useState("");
  const [jobStartTime, setJobStartTime] = useState("");
  const [jobEstHours, setJobEstHours] = useState("");
  const [jobPrice, setJobPrice] = useState("");
  const [jobMaterialBudget, setJobMaterialBudget] = useState("");
  const [jobLaborType, setJobLaborType] = useState("amount");
  const [jobLaborAmount, setJobLaborAmount] = useState("");
  const [jobLaborHours, setJobLaborHours] = useState("");
  const [jobLaborRate, setJobLaborRate] = useState("");

  // Address mode: "client" uses client address to create a new site, "existing" picks existing site, "new" enters a new address
  const [addressMode, setAddressMode] = useState<"client" | "existing" | "new">("client");
  const [selectedSiteId, setSelectedSiteId] = useState("");

  // New site address fields
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newSiteCity, setNewSiteCity] = useState("");
  const [newSiteState, setNewSiteState] = useState("");
  const [newSiteLat, setNewSiteLat] = useState("");
  const [newSiteLng, setNewSiteLng] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const resetJobForm = () => {
    setJobTitle(""); setJobDesc(""); setJobType("one_time");
    setJobStart(""); setJobEnd(""); setJobInterval("");
    setJobStartTime(""); setJobEstHours("");
    setAddressMode("client"); setSelectedSiteId("");
    setNewSiteName(""); setNewSiteAddress(""); setNewSiteCity("");
    setNewSiteState(""); setNewSiteLat(""); setNewSiteLng("");
    setJobPrice(""); setJobMaterialBudget(""); setJobLaborType("amount");
    setJobLaborAmount(""); setJobLaborHours(""); setJobLaborRate("");
  };

  const handleCreateJob = async () => {
    if (!jobTitle.trim() || !jobStart) {
      toast.error("Title and start date are required"); return;
    }

    setCreating(true);
    try {
      let siteId = "";

      if (addressMode === "existing") {
        if (!selectedSiteId) { toast.error("Please select a site"); setCreating(false); return; }
        siteId = selectedSiteId;
      } else {
        // Create a new site from client address or custom address
        const addr = addressMode === "client" ? client.address || "" : newSiteAddress;
        const siteName = addressMode === "client"
          ? `${client.name} - ${client.address || "Main"}`
          : (newSiteName || `${client.name} - Custom`);

        // Parse client address roughly (best-effort city/state extraction)
        let city = "", state = "";
        if (addressMode === "new") {
          city = newSiteCity; state = newSiteState;
        }

        // Geocode if we don't have coords
        let lat = addressMode === "new" ? newSiteLat : "";
        let lng = addressMode === "new" ? newSiteLng : "";

        await createSite({
          name: siteName,
          address: addr || null,
          city: city || null,
          state: state || null,
          zip: null,
          notes: null,
          latitude: lat ? Number(lat) : null,
          longitude: lng ? Number(lng) : null,
          geofence_radius: 150,
          client_id: client.id,
        });

        // Refetch to get the new site ID
        await refetch();
        // Find newly created site
        // We need to query again since refetch updates state async
        const { data: freshSites } = await (await import("@/integrations/supabase/client")).supabase
          .from("job_sites").select("id").eq("name", siteName).order("created_at", { ascending: false }).limit(1);
        if (!freshSites?.[0]) {
          toast.error("Failed to create site"); setCreating(false); return;
        }
        siteId = freshSites[0].id;
      }

      await createJob({
        title: jobTitle,
        site_id: siteId,
        start_date: jobStart,
        end_date: jobEnd || null,
        status: "scheduled",
        job_type: jobType,
        recurring_interval: jobType === "recurring" ? jobInterval || null : null,
        recurring_end_date: null,
        invoice_id: null,
        description: jobDesc || null,
        start_time: jobStartTime || null,
        estimated_hours: jobEstHours ? Number(jobEstHours) : null,
        client_id: client.id,
        price: Number(jobPrice) || 0,
        material_budget: Number(jobMaterialBudget) || 0,
        labor_budget_type: jobLaborType,
        labor_budget_amount: Number(jobLaborAmount) || 0,
        labor_budget_hours: Number(jobLaborHours) || 0,
        labor_budget_rate: Number(jobLaborRate) || 0,
      });

      setJobOpen(false);
      resetJobForm();
    } catch {
      toast.error("Failed to create job");
    } finally {
      setCreating(false);
    }
  };

  // Unlinked jobs (no client_id) for the "Link Existing" search
  const unlinkableJobs = useMemo(() => jobs.filter((j) => !j.client_id), [jobs]);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);

  const filteredUnlinked = useMemo(() => {
    if (!linkSearch.trim()) return unlinkableJobs;
    const q = linkSearch.toLowerCase();
    return unlinkableJobs.filter((j) =>
      j.title.toLowerCase().includes(q) || (siteMap.get(j.site_id)?.name || "").toLowerCase().includes(q)
    );
  }, [unlinkableJobs, linkSearch, siteMap]);

  const handleLinkJob = async (jobId: string) => {
    await updateJob(jobId, { client_id: client.id });
    setLinkOpen(false);
    setLinkSearch("");
    toast.success("Job linked to client");
  };

  const handleUnlinkJob = async (jobId: string) => {
    await updateJob(jobId, { client_id: null } as any);
    toast.success("Job unlinked from client");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> Jobs
        </h3>
        <div className="flex gap-1">
          <Popover open={linkOpen} onOpenChange={(o) => { setLinkOpen(o); if (!o) setLinkSearch(""); }}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" title="Link existing job">
                <Link2 className="h-3.5 w-3.5 mr-1" /> Link
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-72" align="end">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Search unlinked jobs…" value={linkSearch} onValueChange={setLinkSearch} />
                <CommandList>
                  <CommandEmpty>No unlinked jobs found</CommandEmpty>
                  <CommandGroup>
                    {filteredUnlinked.map((j) => (
                      <CommandItem key={j.id} onSelect={() => handleLinkJob(j.id)} className="flex flex-col items-start gap-0.5">
                        <span className="font-medium text-sm">{j.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {j.start_date}{j.start_time ? ` at ${j.start_time}` : ""} · {siteMap.get(j.site_id)?.name || "No site"}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={() => setJobOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New Job
          </Button>
        </div>
      </div>

      {clientJobs.length > 0 ? (
        <div className="space-y-2">
          {clientJobs.map((job) => {
            const site = siteMap.get(job.site_id);
            return (
              <div key={job.id} className="rounded-md border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{job.title}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_COLORS[job.status] || "secondary"} className="text-xs capitalize">
                      {job.status.replace("_", " ")}
                    </Badge>
                    <Select value={job.status} onValueChange={(v) => updateJob(job.id, { status: v })}>
                      <SelectTrigger className="h-6 w-6 p-0 border-0 bg-transparent [&>svg]:hidden">
                        <span className="sr-only">Change status</span>
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Unlink from client" onClick={() => handleUnlinkJob(job.id)}>
                      <Unlink className="h-3 w-3 text-muted-foreground" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this job?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove the job and its assignments.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteJob(job.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {job.start_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {job.start_date}
                      {job.start_time && ` at ${job.start_time}`}
                    </span>
                  )}
                  {site && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {site.name}
                    </span>
                  )}
                  {job.estimated_hours && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {job.estimated_hours}h
                    </span>
                  )}
                  {job.price > 0 && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> ${job.price.toLocaleString()}
                    </span>
                  )}
                </div>
                {job.price > 0 && (() => {
                  const { profit, margin } = getExpectedProfit(
                    job.price, job.material_budget, job.labor_budget_type,
                    job.labor_budget_amount, job.labor_budget_hours, job.labor_budget_rate,
                  );
                  const hasBudget = job.material_budget > 0 || job.labor_budget_amount > 0 || job.labor_budget_hours > 0;
                  return hasBudget ? (
                    <div className="flex gap-3 text-xs">
                      <span className={`font-mono font-medium ${profit >= 0 ? "text-chart-positive" : "text-destructive"}`}>
                        Exp. Profit: ${profit.toLocaleString()} ({margin.toFixed(0)}%)
                      </span>
                    </div>
                  ) : null;
                })()}
                {job.description && <p className="text-xs text-muted-foreground">{job.description}</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4 text-center">No jobs linked to this client yet.</p>
      )}

      {/* Create Job Dialog */}
      <Dialog open={jobOpen} onOpenChange={(o) => { setJobOpen(o); if (!o) resetJobForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Job for {client.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Job title *" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            <Input placeholder="Description (optional)" value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} />

            {/* Address selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Job Location</Label>
              <RadioGroup value={addressMode} onValueChange={(v) => setAddressMode(v as any)}>
                {client.address && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="client" id="addr-client" />
                    <Label htmlFor="addr-client" className="text-sm font-normal">
                      Use client address: <span className="text-muted-foreground">{client.address}</span>
                    </Label>
                  </div>
                )}
                {sites.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="addr-existing" />
                    <Label htmlFor="addr-existing" className="text-sm font-normal">Use existing site</Label>
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="addr-new" />
                  <Label htmlFor="addr-new" className="text-sm font-normal">Enter a different address</Label>
                </div>
              </RadioGroup>
            </div>

            {addressMode === "existing" && (
              <SiteCombobox
                sites={[...clientSites, ...sites.filter(s => s.client_id !== client.id)]}
                value={selectedSiteId}
                onSelect={setSelectedSiteId}
              />
            )}

            {addressMode === "new" && (
              <div className="space-y-2 rounded-md border p-3">
                <Input placeholder="Site name" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} />
                <Input placeholder="Address" value={newSiteAddress} onChange={(e) => setNewSiteAddress(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="City" value={newSiteCity} onChange={(e) => setNewSiteCity(e.target.value)} />
                  <Input placeholder="State" value={newSiteState} onChange={(e) => setNewSiteState(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => geocodeAddress(newSiteAddress, newSiteCity, newSiteState, setNewSiteLat, setNewSiteLng)}
                    disabled={geocoding || (!newSiteAddress && !newSiteCity)}>
                    {geocoding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <MapPin className="h-3.5 w-3.5 mr-1" />}
                    Auto-fill GPS
                  </Button>
                  {newSiteLat && newSiteLng && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {Number(newSiteLat).toFixed(4)}, {Number(newSiteLng).toFixed(4)}
                    </span>
                  )}
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
              <div>
                <Label className="text-xs text-muted-foreground">Start Date *</Label>
                <Input type="date" value={jobStart} onChange={(e) => setJobStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">End Date</Label>
                <Input type="date" value={jobEnd} onChange={(e) => setJobEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Start Time</Label>
                <Input type="time" value={jobStartTime} onChange={(e) => setJobStartTime(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Est. Hours</Label>
                <Input type="number" min="0.5" step="0.5" placeholder="e.g. 4" value={jobEstHours} onChange={(e) => setJobEstHours(e.target.value)} />
              </div>
            </div>

            {jobType === "recurring" && (
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
            )}

            <JobBudgetFields
              price={jobPrice} materialBudget={jobMaterialBudget}
              laborBudgetType={jobLaborType} laborBudgetAmount={jobLaborAmount}
              laborBudgetHours={jobLaborHours} laborBudgetRate={jobLaborRate}
              onPriceChange={setJobPrice} onMaterialBudgetChange={setJobMaterialBudget}
              onLaborBudgetTypeChange={setJobLaborType} onLaborBudgetAmountChange={setJobLaborAmount}
              onLaborBudgetHoursChange={setJobLaborHours} onLaborBudgetRateChange={setJobLaborRate}
            />

            <Button className="w-full" onClick={handleCreateJob} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Job
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
