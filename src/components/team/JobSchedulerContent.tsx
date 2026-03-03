import { useState, useCallback } from "react";
import { useJobs, type Job, type JobSite } from "@/hooks/useJobs";
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
import { Plus, MapPin, Briefcase, Loader2, Pencil, Trash2, Camera } from "lucide-react";
import { toast } from "sonner";
import JobPhotosPanel from "@/components/job/JobPhotosPanel";

export default function JobSchedulerContent() {
  const { sites, jobs, loading, createSite, updateSite, deleteSite, createJob, updateJob, deleteJob } = useJobs();
  const [tab, setTab] = useState("jobs");

  // Create site state
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [siteState, setSiteState] = useState("");
  const [siteLat, setSiteLat] = useState("");
  const [siteLng, setSiteLng] = useState("");
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

  // Create job state
  const [jobOpen, setJobOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobSiteId, setJobSiteId] = useState("");
  const [jobType, setJobType] = useState("one_time");
  const [jobStart, setJobStart] = useState("");
  const [jobEnd, setJobEnd] = useState("");
  const [jobInterval, setJobInterval] = useState("");
  const [jobDesc, setJobDesc] = useState("");

  // Edit job state
  const [editJobOpen, setEditJobOpen] = useState(false);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editJobSiteId, setEditJobSiteId] = useState("");
  const [editJobType, setEditJobType] = useState("one_time");
  const [editJobStart, setEditJobStart] = useState("");
  const [editJobEnd, setEditJobEnd] = useState("");
  const [editJobInterval, setEditJobInterval] = useState("");
  const [editJobDesc, setEditJobDesc] = useState("");

  // Photos dialog state
  const [photosJobId, setPhotosJobId] = useState<string | null>(null);

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

  const handleCreateSite = async () => {
    if (!siteName.trim()) { toast.error("Name is required"); return; }
    await createSite({
      name: siteName, address: siteAddress || null, city: siteCity || null,
      state: siteState || null, zip: null, notes: null,
      latitude: siteLat ? Number(siteLat) : null,
      longitude: siteLng ? Number(siteLng) : null,
      geofence_radius: 150,
    });
    setSiteOpen(false);
    setSiteName(""); setSiteAddress(""); setSiteCity(""); setSiteState("");
    setSiteLat(""); setSiteLng("");
  };

  const openEditSite = (s: JobSite) => {
    setEditSite(s);
    setEditSiteName(s.name);
    setEditSiteAddress(s.address || "");
    setEditSiteCity(s.city || "");
    setEditSiteState(s.state || "");
    setEditSiteLat(s.latitude != null ? String(s.latitude) : "");
    setEditSiteLng(s.longitude != null ? String(s.longitude) : "");
    setEditSiteOpen(true);
  };

  const handleUpdateSite = async () => {
    if (!editSite || !editSiteName.trim()) { toast.error("Name is required"); return; }
    await updateSite(editSite.id, {
      name: editSiteName, address: editSiteAddress || null, city: editSiteCity || null,
      state: editSiteState || null,
      latitude: editSiteLat ? Number(editSiteLat) : null,
      longitude: editSiteLng ? Number(editSiteLng) : null,
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
      recurring_end_date: null, invoice_id: null, description: jobDesc || null,
    });
    setJobOpen(false);
    setJobTitle(""); setJobSiteId(""); setJobType("one_time");
    setJobStart(""); setJobEnd(""); setJobInterval(""); setJobDesc("");
  };

  const openEditJob = (j: Job) => {
    setEditJob(j);
    setEditJobTitle(j.title);
    setEditJobSiteId(j.site_id);
    setEditJobType(j.job_type);
    setEditJobStart(j.start_date);
    setEditJobEnd(j.end_date || "");
    setEditJobInterval(j.recurring_interval || "");
    setEditJobDesc(j.description || "");
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
      description: editJobDesc || null,
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
              <Button className="w-full" onClick={handleCreateSite}>Create Site</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={jobOpen} onOpenChange={setJobOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />New Job</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Job</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <Input placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              <Input placeholder="Description (optional)" value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} />
              <Select value={jobSiteId} onValueChange={setJobSiteId}>
                <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                <SelectContent>
                  {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
              {jobType === "recurring" && (
                <Select value={jobInterval} onValueChange={setJobInterval}>
                  <SelectTrigger><SelectValue placeholder="Repeat interval" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              )}
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
            <Button className="w-full" onClick={handleUpdateSite}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Job Dialog */}
      <Dialog open={editJobOpen} onOpenChange={setEditJobOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Job</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Job title" value={editJobTitle} onChange={(e) => setEditJobTitle(e.target.value)} />
            <Input placeholder="Description (optional)" value={editJobDesc} onChange={(e) => setEditJobDesc(e.target.value)} />
            <Select value={editJobSiteId} onValueChange={setEditJobSiteId}>
              <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
              <SelectContent>
                {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
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
            {editJobType === "recurring" && (
              <Select value={editJobInterval} onValueChange={setEditJobInterval}>
                <SelectTrigger><SelectValue placeholder="Repeat interval" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button className="w-full" onClick={handleUpdateJob}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
        </TabsList>
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
                      <TableHead>Description</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Photos</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell className="font-medium">{j.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">{j.description || "—"}</TableCell>
                        <TableCell>{siteMap.get(j.site_id)?.name || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{j.job_type}</Badge></TableCell>
                        <TableCell>{j.start_date}</TableCell>
                        <TableCell>
                          <Select value={j.status} onValueChange={(v) => updateJob(j.id, { status: v })}>
                            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="scheduled">Scheduled</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => setPhotosJobId(j.id)}
                          >
                            <Camera className="h-3.5 w-3.5" />
                            📷
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
                    ))}
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
                      <TableHead>Address</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>GPS</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
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
                    ))}
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
          {photosJobId && <JobPhotosPanel jobId={photosJobId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
