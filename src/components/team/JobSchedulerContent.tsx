import { useState, useCallback } from "react";
import { useJobs } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, MapPin, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function JobSchedulerContent() {
  const { sites, jobs, loading, createSite, createJob, updateJob } = useJobs();
  const [tab, setTab] = useState("jobs");
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [siteState, setSiteState] = useState("");
  const [siteLat, setSiteLat] = useState("");
  const [siteLng, setSiteLng] = useState("");
  const [jobOpen, setJobOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobSiteId, setJobSiteId] = useState("");
  const [jobType, setJobType] = useState("one_time");
  const [jobStart, setJobStart] = useState("");
  const [jobEnd, setJobEnd] = useState("");
  const [jobInterval, setJobInterval] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const geocodeAddress = useCallback(async () => {
    const query = [siteAddress, siteCity, siteState].filter(Boolean).join(", ");
    if (!query.trim()) return;
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { "User-Agent": "LovableApp/1.0" } }
      );
      const data = await res.json();
      if (data?.[0]) {
        setSiteLat(data[0].lat);
        setSiteLng(data[0].lon);
        toast.success("GPS coordinates found");
      } else {
        toast.error("Could not find coordinates for this address");
      }
    } catch {
      toast.error("Geocoding failed");
    } finally {
      setGeocoding(false);
    }
  }, [siteAddress, siteCity, siteState]);

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

  const handleCreateJob = async () => {
    if (!jobTitle.trim() || !jobSiteId || !jobStart) {
      toast.error("Title, site, and start date are required"); return;
    }
    await createJob({
      title: jobTitle, site_id: jobSiteId, start_date: jobStart,
      end_date: jobEnd || null, status: "scheduled", job_type: jobType,
      recurring_interval: jobType === "recurring" ? jobInterval || null : null,
      recurring_end_date: null, invoice_id: null, description: null,
    });
    setJobOpen(false);
    setJobTitle(""); setJobSiteId(""); setJobType("one_time");
    setJobStart(""); setJobEnd(""); setJobInterval("");
  };

  const siteMap = new Map(sites.map((s) => [s.id, s]));

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
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={geocodeAddress} disabled={geocoding || (!siteAddress && !siteCity)}>
                  {geocoding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <MapPin className="h-3.5 w-3.5 mr-1" />}
                  {geocoding ? "Looking up…" : "Auto-fill GPS"}
                </Button>
                {siteLat && siteLng && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {Number(siteLat).toFixed(4)}, {Number(siteLng).toFixed(4)}
                  </span>
                )}
              </div>
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
                      <TableHead>Site</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell className="font-medium">{j.title}</TableCell>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
