import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCrewCheckins } from "@/hooks/useCrewCheckins";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Download, Users, Clock } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const crewIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const siteIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface TeamMemberInfo { id: string; name: string; email: string; role: string; }
interface SiteInfo { id: string; name: string; latitude: number | null; longitude: number | null; address: string | null; }

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [points, map]);
  return null;
}

export default function CrewMapContent() {
  const { user } = useAuth();
  const { checkins } = useCrewCheckins();
  const [members, setMembers] = useState<TeamMemberInfo[]>([]);
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [filterSite, setFilterSite] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [memRes, sitesRes] = await Promise.all([
        supabase.from("team_members").select("id, name, email, role").eq("business_user_id", user.id),
        supabase.from("job_sites").select("id, name, latitude, longitude, address").eq("user_id", user.id),
      ]);
      if (memRes.data) setMembers(memRes.data as TeamMemberInfo[]);
      if (sitesRes.data) setSites(sitesRes.data as SiteInfo[]);
    };
    fetchData();
  }, [user]);

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const activeCheckins = checkins.filter((c) => c.status === "checked_in");
  const filtered = filterSite === "all" ? activeCheckins : activeCheckins.filter((c) => c.job_site_id === filterSite);

  const allMapPoints = useMemo(() => {
    const pts: [number, number][] = [];
    filtered.forEach((c) => {
      if (c.check_in_lat && c.check_in_lng) pts.push([Number(c.check_in_lat), Number(c.check_in_lng)]);
    });
    sites.forEach((s) => {
      if (s.latitude && s.longitude) pts.push([Number(s.latitude), Number(s.longitude)]);
    });
    return pts;
  }, [filtered, sites]);

  const defaultCenter: [number, number] = allMapPoints.length > 0 ? allMapPoints[0] : [39.8283, -98.5795];

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">On-Site Now</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{activeCheckins.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Check-ins Today</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {checkins.filter((c) => new Date(c.check_in_time).toDateString() === new Date().toDateString()).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Team Members</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{members.length}</div></CardContent>
        </Card>
      </div>

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
          <div className="rounded-lg overflow-hidden border" style={{ height: 480 }}>
            <MapContainer
              center={defaultCenter}
              zoom={allMapPoints.length > 0 ? 13 : 4}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {allMapPoints.length > 1 && <FitBounds points={allMapPoints} />}

              {/* Job Site pins (blue) */}
              {sites
                .filter((s) => s.latitude && s.longitude)
                .filter((s) => filterSite === "all" || s.id === filterSite)
                .map((s) => (
                  <Marker key={`site-${s.id}`} position={[Number(s.latitude), Number(s.longitude)]} icon={siteIcon}>
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold">{s.name}</p>
                        {s.address && <p className="text-xs text-muted-foreground">{s.address}</p>}
                        <p className="text-xs mt-1 font-medium">📍 Job Site</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}

              {/* Crew member pins (green) */}
              {filtered
                .filter((c) => c.check_in_lat && c.check_in_lng)
                .map((c) => {
                  const member = memberMap.get(c.team_member_id);
                  const site = c.job_site_id ? siteMap.get(c.job_site_id) : null;
                  return (
                    <Marker key={`crew-${c.id}`} position={[Number(c.check_in_lat), Number(c.check_in_lng)]} icon={crewIcon}>
                      <Popup>
                        <div className="text-sm space-y-1">
                          <p className="font-semibold">{member?.name || "Unknown"}</p>
                          {site && <p className="text-xs">{site.name}</p>}
                          <p className="text-xs text-muted-foreground">
                            Checked in {new Date(c.check_in_time).toLocaleTimeString()}
                          </p>
                          <p className="text-xs font-medium">🟢 On-Site</p>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
            </MapContainer>
          </div>

          {/* Legend */}
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
