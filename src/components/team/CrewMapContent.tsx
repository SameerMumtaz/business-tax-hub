import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCrewCheckins } from "@/hooks/useCrewCheckins";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Download, Users, Clock } from "lucide-react";
import CheckInProgressWidget from "./CheckInProgressWidget";
import TodayJobs from "@/components/dashboard/TodayJobs";
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
interface SiteInfo { id: string; name: string; latitude: number | null; longitude: number | null; address: string | null; }

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

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current).setView([39.8283, -98.5795], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current);
    markersRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when data changes
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

export default function CrewMapContent() {
  const { user } = useAuth();
  const { checkins } = useCrewCheckins();
  const [members, setMembers] = useState<TeamMemberInfo[]>([]);
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [filterSite, setFilterSite] = useState<string>("all");
  const [jobs, setJobs] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [memRes, sitesRes, jobsRes, assignRes] = await Promise.all([
        supabase.from("team_members").select("id, name, email, role").eq("business_user_id", user.id),
        supabase.from("job_sites").select("id, name, latitude, longitude, address").eq("user_id", user.id),
        supabase.from("jobs").select("id, title, start_date, end_date, start_time, estimated_hours, job_type, status, recurring_interval, recurring_end_date").eq("user_id", user.id).neq("status", "cancelled"),
        supabase.from("job_assignments").select("job_id, worker_id, worker_name"),
      ]);
      if (memRes.data) setMembers(memRes.data as TeamMemberInfo[]);
      if (sitesRes.data) setSites(sitesRes.data as SiteInfo[]);
      if (jobsRes.data) setJobs(jobsRes.data);
      if (assignRes.data) setAssignments(assignRes.data);
    };
    fetchData();
  }, [user]);

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const activeCheckins = checkins.filter((c) => c.status === "checked_in");
  const filtered = filterSite === "all" ? activeCheckins : activeCheckins.filter((c) => c.job_site_id === filterSite);

  const crewMarkers = useMemo(() =>
    filtered
      .filter((c) => c.check_in_lat && c.check_in_lng)
      .map((c) => ({
        lat: Number(c.check_in_lat),
        lng: Number(c.check_in_lng),
        name: memberMap.get(c.team_member_id)?.name || "Unknown",
        site: c.job_site_id ? siteMap.get(c.job_site_id)?.name || "" : "",
        time: new Date(c.check_in_time).toLocaleTimeString(),
      })),
    [filtered, memberMap, siteMap]
  );

  const siteMarkers = useMemo(() =>
    sites
      .filter((s) => s.latitude && s.longitude)
      .filter((s) => filterSite === "all" || s.id === filterSite)
      .map((s) => ({ lat: Number(s.latitude), lng: Number(s.longitude), name: s.name, address: s.address })),
    [sites, filterSite]
  );

  const exportCSV = () => {
    const headers = ["Name", "Site", "Check In Time", "Check Out Time", "Total Hours", "Check In Lat", "Check In Lng", "Check Out Lat", "Check Out Lng", "Status"];
    const rows = checkins.map((c) => {
      const member = memberMap.get(c.team_member_id);
      const site = c.job_site_id ? siteMap.get(c.job_site_id) : null;
      return [
        member?.name || "Unknown", site?.name || "—",
        new Date(c.check_in_time).toLocaleString(),
        c.check_out_time ? new Date(c.check_out_time).toLocaleString() : "",
        c.total_hours?.toString() || "0",
        c.check_in_lat?.toString() || "", c.check_in_lng?.toString() || "",
        c.check_out_lat?.toString() || "", c.check_out_lng?.toString() || "",
        c.status,
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

      {/* Active crew cards with live timers */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((c) => {
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Live Crew Map</CardTitle>
            <Select value={filterSite} onValueChange={setFilterSite}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Filter by site" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
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

      <Card>
        <CardHeader><CardTitle>All Check-ins</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Crew Member</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checkins.slice(0, 50).map((c) => {
                const member = memberMap.get(c.team_member_id);
                const site = c.job_site_id ? siteMap.get(c.job_site_id) : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{member?.name || "Unknown"}</TableCell>
                    <TableCell>{site?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{new Date(c.check_in_time).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{c.check_out_time ? new Date(c.check_out_time).toLocaleString() : "—"}</TableCell>
                    <TableCell>{c.total_hours > 0 ? `${c.total_hours.toFixed(1)}h` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "checked_in" ? "default" : "secondary"}>
                        {c.status === "checked_in" ? "On-Site" : "Completed"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
