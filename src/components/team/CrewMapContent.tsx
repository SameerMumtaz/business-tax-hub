import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCrewCheckins } from "@/hooks/useCrewCheckins";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Download, Users, Clock } from "lucide-react";

interface TeamMemberInfo { id: string; name: string; email: string; role: string; }
interface SiteInfo { id: string; name: string; }

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
        supabase.from("job_sites").select("id, name").eq("user_id", user.id),
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
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No crew members currently on-site</p>
            </div>
          ) : (
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
                    {c.check_in_lat && (
                      <p className="text-[10px] font-mono text-muted-foreground">
                        {Number(c.check_in_lat).toFixed(5)}, {Number(c.check_in_lng).toFixed(5)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
