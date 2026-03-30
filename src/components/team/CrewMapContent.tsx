import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCrewCheckins } from "@/hooks/useCrewCheckins";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, Download, Users, Clock, Filter } from "lucide-react";
import CheckInProgressWidget from "./CheckInProgressWidget";
import TodayScheduledVsActual from "./TodayScheduledVsActual";
import TodayJobs from "@/components/dashboard/TodayJobs";
import AllCheckinsTable from "./AllCheckinsTable";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const crewIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const siteIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

interface TeamMemberInfo { id: string; name: string; email: string; role: string; }
interface SiteInfo { id: string; name: string; latitude: number | null; longitude: number | null; address: string | null; geofence_radius: number | null; client_id: string | null; state: string | null; }
interface ClientInfo { id: string; name: string; }
interface PhotoInfo { id: string; job_id: string; photo_url: string; photo_type: string; occurrence_date: string | null; }

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
  return <span className="font-mono text-xs font-semibold">{elapsed}</span>;
}

function LeafletMap({ crewMarkers, siteMarkers }: {
  crewMarkers: { lat: number; lng: number; name: string; site: string; time: string }[];
  siteMarkers: { lat: number; lng: number; name: string; address: string | null }[];
}) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current).setView([39.8283, -98.5795], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current);
    markersRef.current = L.layerGroup().addTo(mapRef.current);
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;
    markersRef.current.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    siteMarkers.forEach((s) => {
      const marker = L.marker([s.lat, s.lng], { icon: siteIcon });
      marker.bindPopup(`<div style="font-size:13px"><b>${s.name}</b>${s.address ? `<br/><span style="color:#888">${s.address}</span>` : ""}<br/><span style="color:#3b82f6">📍 Job Site</span></div>`);
      markersRef.current!.addLayer(marker);
      bounds.push([s.lat, s.lng]);
    });

    crewMarkers.forEach((c) => {
      const marker = L.marker([c.lat, c.lng], { icon: crewIcon });
      marker.bindPopup(`<div style="font-size:13px"><b>${c.name}</b>${c.site ? `<br/>${c.site}` : ""}<br/><span style="color:#888">Checked in ${c.time}</span><br/><span style="color:#16a34a">🟢 On-Site</span></div>`);
      markersRef.current!.addLayer(marker);
      bounds.push([c.lat, c.lng]);
    });

    if (bounds.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(bounds as L.LatLngTuple[]), { padding: [50, 50], maxZoom: 15 });
    }
  }, [crewMarkers, siteMarkers]);

  return <div ref={containerRef} style={{ height: 480, width: "100%" }} className="rounded-lg" />;
}

/** Get today's date string in YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Check if a job falls on today */
function isJobOnToday(job: any, today: string): boolean {
  if (job.job_type === "recurring") {
    if (job.start_date > today) return false;
    if (job.recurring_end_date && job.recurring_end_date < today) return false;
    // For recurring, check if today matches the interval pattern
    const start = new Date(job.start_date);
    const now = new Date(today);
    const diffDays = Math.floor((now.getTime() - start.getTime()) / 86400000);
    if (job.recurring_interval === "daily") return true;
    if (job.recurring_interval === "weekly") return diffDays % 7 === 0;
    if (job.recurring_interval === "biweekly") return diffDays % 14 === 0;
    if (job.recurring_interval === "monthly") return start.getDate() === now.getDate();
    return true; // fallback: show it
  }
  // One-time: check date range
  return job.start_date <= today && (job.end_date || job.start_date) >= today;
}

export default function CrewMapContent() {
  const { user } = useAuth();
  const { checkins } = useCrewCheckins();
  const [members, setMembers] = useState<TeamMemberInfo[]>([]);
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);

  // Filters
  const [filterSite, setFilterSite] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterCrew, setFilterCrew] = useState<string>("all");
  const [todayOnly, setTodayOnly] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [memRes, sitesRes, jobsRes, assignRes, photosRes, clientsRes] = await Promise.all([
        supabase.from("team_members").select("id, name, email, role").eq("business_user_id", user.id),
        supabase.from("job_sites").select("id, name, latitude, longitude, address, geofence_radius, client_id, state").eq("user_id", user.id),
        supabase.from("jobs").select("id, title, start_date, end_date, start_time, estimated_hours, job_type, status, recurring_interval, recurring_end_date, site_id").eq("user_id", user.id).neq("status", "cancelled"),
        supabase.from("job_assignments").select("job_id, worker_id, worker_name, worker_type, hours_per_day, assigned_days"),
        supabase.from("job_photos").select("id, job_id, photo_url, photo_type, occurrence_date"),
        supabase.from("clients").select("id, name").eq("user_id", user.id),
      ]);
      if (memRes.data) setMembers(memRes.data as TeamMemberInfo[]);
      if (sitesRes.data) setSites(sitesRes.data as SiteInfo[]);
      if (jobsRes.data) setJobs(jobsRes.data);
      if (assignRes.data) setAssignments(assignRes.data);
      if (photosRes.data) setPhotos(photosRes.data as PhotoInfo[]);
      if (clientsRes.data) setClients(clientsRes.data as ClientInfo[]);
    };
    fetchData();
  }, [user]);

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const activeCheckins = checkins.filter((c) => c.status === "checked_in");

  // Derive unique states from sites
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    sites.forEach(s => { if (s.state) states.add(s.state); });
    return Array.from(states).sort();
  }, [sites]);

  // Derive unique clients that have sites
  const siteClients = useMemo(() => {
    const ids = new Set<string>();
    sites.forEach(s => { if (s.client_id) ids.add(s.client_id); });
    return clients.filter(c => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [sites, clients]);

  const today = useMemo(() => todayStr(), []);

  // Today's scheduled site IDs
  const todaysSiteIds = useMemo(() => {
    const todayJobs = jobs.filter(j => isJobOnToday(j, today));
    return new Set(todayJobs.map(j => j.site_id));
  }, [jobs, today]);

  // Today's crew IDs (workers assigned to today's jobs)
  const todaysCrewIds = useMemo(() => {
    const todayJobIds = new Set(jobs.filter(j => isJobOnToday(j, today)).map(j => j.id));
    const ids = new Set<string>();
    assignments.forEach(a => { if (todayJobIds.has(a.job_id)) ids.add(a.worker_id); });
    return ids;
  }, [jobs, assignments, today]);

  // Build the set of visible site IDs based on all filters
  const visibleSiteIds = useMemo(() => {
    let filtered = sites;

    // Today filter
    if (todayOnly) {
      filtered = filtered.filter(s => todaysSiteIds.has(s.id));
    }

    // Client filter
    if (filterClient !== "all") {
      filtered = filtered.filter(s => s.client_id === filterClient);
    }

    // State filter
    if (filterState !== "all") {
      filtered = filtered.filter(s => s.state === filterState);
    }

    // Crew filter: show only sites that have jobs assigned to this crew member
    if (filterCrew !== "all") {
      const crewJobIds = new Set(assignments.filter(a => a.worker_id === filterCrew).map(a => a.job_id));
      const crewSiteIds = new Set(jobs.filter(j => crewJobIds.has(j.id)).map(j => j.site_id));
      filtered = filtered.filter(s => crewSiteIds.has(s.id));
    }

    // Specific site filter
    if (filterSite !== "all") {
      filtered = filtered.filter(s => s.id === filterSite);
    }

    return new Set(filtered.map(s => s.id));
  }, [sites, todayOnly, todaysSiteIds, filterClient, filterState, filterCrew, filterSite, assignments, jobs]);

  // Filter checkins to visible sites
  const filteredCheckins = activeCheckins.filter((c) =>
    !c.job_site_id || visibleSiteIds.has(c.job_site_id)
  );

  const crewMarkers = useMemo(() =>
    filteredCheckins
      .filter((c) => c.check_in_lat && c.check_in_lng)
      .map((c) => ({
        lat: Number(c.check_in_lat),
        lng: Number(c.check_in_lng),
        name: memberMap.get(c.team_member_id)?.name || "Unknown",
        site: c.job_site_id ? siteMap.get(c.job_site_id)?.name || "" : "",
        time: new Date(c.check_in_time).toLocaleTimeString(),
      })),
    [filteredCheckins, memberMap, siteMap]
  );

  const siteMarkers = useMemo(() =>
    sites
      .filter((s) => s.latitude && s.longitude && visibleSiteIds.has(s.id))
      .map((s) => ({ lat: Number(s.latitude), lng: Number(s.longitude), name: s.name, address: s.address })),
    [sites, visibleSiteIds]
  );

  // Available sites for the site dropdown (respect other filters)
  const filteredSitesForDropdown = useMemo(() => {
    let list = sites;
    if (todayOnly) list = list.filter(s => todaysSiteIds.has(s.id));
    if (filterClient !== "all") list = list.filter(s => s.client_id === filterClient);
    if (filterState !== "all") list = list.filter(s => s.state === filterState);
    if (filterCrew !== "all") {
      const crewJobIds = new Set(assignments.filter(a => a.worker_id === filterCrew).map(a => a.job_id));
      const crewSiteIds = new Set(jobs.filter(j => crewJobIds.has(j.id)).map(j => j.site_id));
      list = list.filter(s => crewSiteIds.has(s.id));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [sites, todayOnly, todaysSiteIds, filterClient, filterState, filterCrew, assignments, jobs]);

  const activeFilterCount = [
    filterClient !== "all",
    filterState !== "all",
    filterCrew !== "all",
    filterSite !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterSite("all");
    setFilterClient("all");
    setFilterState("all");
    setFilterCrew("all");
  };

  const exportCSV = () => {
    const jobMap = new Map(jobs.map((j: any) => [j.id, j]));
    const headers = ["Name", "Job", "Site", "Check In Time", "Check Out Time", "Total Hours", "Est Hours", "Check In Lat", "Check In Lng", "Check Out Lat", "Check Out Lng", "Status", "Flag"];
    const rows = checkins.map((c) => {
      const member = memberMap.get(c.team_member_id);
      const site = c.job_site_id ? siteMap.get(c.job_site_id) : null;
      const job = c.job_id ? jobMap.get(c.job_id) : null;
      return [
        member?.name || "Unknown", job?.title || "", site?.name || "—",
        new Date(c.check_in_time).toLocaleString(),
        c.check_out_time ? new Date(c.check_out_time).toLocaleString() : "",
        c.total_hours?.toString() || "0",
        job?.estimated_hours?.toString() || "",
        c.check_in_lat?.toString() || "", c.check_in_lng?.toString() || "",
        c.check_out_lat?.toString() || "", c.check_out_lng?.toString() || "",
        c.status,
        c.flag_reason || "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `crew-checkins-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-2" />Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="md:col-span-2 lg:col-span-2">
          <TodayJobs />
        </div>
        <CheckInProgressWidget jobs={jobs} assignments={assignments} checkins={checkins} />
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
          <Card className="h-full flex flex-col justify-center">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">On-Site Now</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-primary">{activeCheckins.length}</div></CardContent>
          </Card>
          <Card className="h-full flex flex-col justify-center">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Team Members</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{members.length}</div></CardContent>
          </Card>
        </div>
      </div>

      <TodayScheduledVsActual jobs={jobs} assignments={assignments} checkins={checkins} members={members} />

      {filteredCheckins.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredCheckins.map((c) => {
            const member = memberMap.get(c.team_member_id);
            const site = c.job_site_id ? siteMap.get(c.job_site_id) : null;
            return (
              <div key={c.id} className="bg-accent/50 border rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="font-medium text-sm truncate">{member?.name || "Unknown"}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{site?.name || "Unknown site"}</p>
                <p className="text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 inline mr-1" />{new Date(c.check_in_time).toLocaleTimeString()}
                </p>
                <p className="text-xs">⏱ <LiveElapsed since={c.check_in_time} /></p>
              </div>
            );
          })}
        </div>
      )}

      <Card className="overflow-visible">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Live Crew Map</CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch id="today-only" checked={todayOnly} onCheckedChange={setTodayOnly} />
                <Label htmlFor="today-only" className="text-sm font-medium cursor-pointer whitespace-nowrap">
                  Today's schedule
                </Label>
              </div>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground h-7 px-2">
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

            {/* Client filter */}
            <Select value={filterClient} onValueChange={(v) => { setFilterClient(v); setFilterSite("all"); }}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                <SelectItem value="all">All Clients</SelectItem>
                {siteClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* State filter */}
            <Select value={filterState} onValueChange={(v) => { setFilterState(v); setFilterSite("all"); }}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                <SelectItem value="all">All States</SelectItem>
                {uniqueStates.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Crew filter */}
            <Select value={filterCrew} onValueChange={(v) => { setFilterCrew(v); setFilterSite("all"); }}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Crew" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                <SelectItem value="all">All Crew</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Site filter */}
            <Select value={filterSite} onValueChange={setFilterSite}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Site" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                <SelectItem value="all">All Sites</SelectItem>
                {filteredSitesForDropdown.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Active filter count badge */}
            {(activeFilterCount > 0 || todayOnly) && (
              <Badge variant="secondary" className="text-xs h-6">
                {todayOnly ? `Today · ${visibleSiteIds.size} sites` : `${visibleSiteIds.size} sites`}
                {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""}`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg overflow-hidden border">
            <LeafletMap crewMarkers={crewMarkers} siteMarkers={siteMarkers} />
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-primary" /> Crew Member
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-accent" /> Job Site
            </span>
          </div>
        </CardContent>
      </Card>

      <AllCheckinsTable
        checkins={checkins}
        members={members}
        sites={sites}
        jobs={jobs}
        photos={photos}
      />
    </div>
  );
}
