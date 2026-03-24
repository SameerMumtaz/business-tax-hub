import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search, Camera, MapPin, ShieldCheck, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { isWithinGeofence, haversineDistance } from "@/lib/geofence";
import type { CrewCheckin } from "@/hooks/useCrewCheckins";

interface SiteInfo { id: string; name: string; latitude: number | null; longitude: number | null; geofence_radius: number | null; }
interface MemberInfo { id: string; name: string; }
interface JobInfo { id: string; title: string; estimated_hours: number | null; }
interface PhotoInfo { id: string; job_id: string; photo_url: string; photo_type: string; occurrence_date: string | null; }

interface Props {
  checkins: CrewCheckin[];
  members: MemberInfo[];
  sites: SiteInfo[];
  jobs: JobInfo[];
  photos: PhotoInfo[];
}

const PAGE_SIZE = 25;

export default function AllCheckinsTable({ checkins, members, sites, jobs, photos }: Props) {
  const [search, setSearch] = useState("");
  const [filterMember, setFilterMember] = useState("all");
  const [filterSite, setFilterSite] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [photoDialog, setPhotoDialog] = useState<{ jobId: string; date: string } | null>(null);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const jobMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  // Photo counts by job+date
  const photoCounts = useMemo(() => {
    const map = new Map<string, PhotoInfo[]>();
    for (const p of photos) {
      const key = `${p.job_id}:${p.occurrence_date || ""}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [photos]);

  const filtered = useMemo(() => {
    let result = checkins;
    if (filterMember !== "all") result = result.filter((c) => c.team_member_id === filterMember);
    if (filterSite !== "all") result = result.filter((c) => c.job_site_id === filterSite);
    if (filterStatus !== "all") {
      if (filterStatus === "checked_in") result = result.filter((c) => c.status === "checked_in");
      else if (filterStatus === "checked_out") result = result.filter((c) => c.status === "checked_out");
      else if (filterStatus === "flagged") result = result.filter((c) => c.flag_reason);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const member = memberMap.get(c.team_member_id);
        const site = c.job_site_id ? siteMap.get(c.job_site_id) : null;
        const job = c.job_id ? jobMap.get(c.job_id) : null;
        return (
          (member?.name || "").toLowerCase().includes(q) ||
          (site?.name || "").toLowerCase().includes(q) ||
          (job?.title || "").toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [checkins, filterMember, filterSite, filterStatus, search, memberMap, siteMap, jobMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const getGpsStatus = (c: CrewCheckin): "verified" | "outside" | "unknown" => {
    if (!c.check_in_lat || !c.check_in_lng || !c.job_site_id) return "unknown";
    const site = siteMap.get(c.job_site_id);
    if (!site?.latitude || !site?.longitude) return "unknown";
    const radius = site.geofence_radius || 150;
    return isWithinGeofence(c.check_in_lat, c.check_in_lng, site.latitude, site.longitude, radius)
      ? "verified"
      : "outside";
  };

  const getVariance = (c: CrewCheckin) => {
    if (!c.job_id) return null;
    const job = jobMap.get(c.job_id);
    if (!job?.estimated_hours || !c.total_hours) return null;
    const diff = c.total_hours - job.estimated_hours;
    const pct = Math.round((diff / job.estimated_hours) * 100);
    return { actual: c.total_hours, estimated: job.estimated_hours, diff, pct };
  };

  const getJobPhotos = (c: CrewCheckin) => {
    if (!c.job_id) return [];
    const key = `${c.job_id}:${c.occurrence_date || ""}`;
    return photoCounts.get(key) || [];
  };

  const dialogPhotos = useMemo(() => {
    if (!photoDialog) return [];
    const key = `${photoDialog.jobId}:${photoDialog.date}`;
    return photoCounts.get(key) || [];
  }, [photoDialog, photoCounts]);

  const uniqueMembers = useMemo(() => {
    const ids = new Set(checkins.map((c) => c.team_member_id));
    return members.filter((m) => ids.has(m.id));
  }, [checkins, members]);

  const uniqueSites = useMemo(() => {
    const ids = new Set(checkins.map((c) => c.job_site_id).filter(Boolean));
    return sites.filter((s) => ids.has(s.id));
  }, [checkins, sites]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>All Check-ins</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search crew, site, or job…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9 h-9"
              />
            </div>
            <Select value={filterMember} onValueChange={(v) => { setFilterMember(v); setPage(0); }}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="All crew" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All crew</SelectItem>
                {uniqueMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterSite} onValueChange={(v) => { setFilterSite(v); setPage(0); }}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="All sites" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {uniqueSites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="checked_in">On-Site</SelectItem>
                <SelectItem value="checked_out">Completed</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Crew Member</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead className="text-center">Photos</TableHead>
                  <TableHead className="text-center">GPS</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No check-ins found
                    </TableCell>
                  </TableRow>
                )}
                {paged.map((c) => {
                  const member = memberMap.get(c.team_member_id);
                  const site = c.job_site_id ? siteMap.get(c.job_site_id) : null;
                  const job = c.job_id ? jobMap.get(c.job_id) : null;
                  const gps = getGpsStatus(c);
                  const variance = getVariance(c);
                  const jobPhotos = getJobPhotos(c);
                  const hasBefore = jobPhotos.some((p) => p.photo_type === "before");
                  const hasAfter = jobPhotos.some((p) => p.photo_type === "after");

                  return (
                    <TableRow key={c.id} className={cn(c.flag_reason && "bg-amber-50/50 dark:bg-amber-900/5")}>
                      <TableCell className="font-medium">{member?.name || "Unknown"}</TableCell>
                      <TableCell className="text-sm">{job?.title || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {site ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                            {site.name}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(c.check_in_time).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {c.check_out_time ? new Date(c.check_out_time).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {c.total_hours > 0 ? `${c.total_hours.toFixed(1)}h` : "—"}
                      </TableCell>
                      <TableCell>
                        {variance ? (
                          <span className={cn(
                            "text-xs font-medium tabular-nums",
                            variance.diff > 0.5 ? "text-amber-600 dark:text-amber-400" :
                            variance.diff < -0.5 ? "text-blue-600 dark:text-blue-400" :
                            "text-emerald-600 dark:text-emerald-400"
                          )}>
                            {c.total_hours.toFixed(1)}h / {variance.estimated}h
                            <span className="ml-1 text-[10px]">
                              ({variance.diff > 0 ? "+" : ""}{variance.pct}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.job_id && jobPhotos.length > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => setPhotoDialog({ jobId: c.job_id!, date: c.occurrence_date || "" })}
                          >
                            <Camera className="h-3 w-3" />
                            {jobPhotos.length}
                            <span className="flex gap-0.5 ml-0.5">
                              {hasBefore && <span className="h-1.5 w-1.5 rounded-full bg-blue-400" title="Before" />}
                              {hasAfter && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="After" />}
                            </span>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {gps === "verified" && (
                          <ShieldCheck className="h-4 w-4 text-emerald-500 mx-auto" />
                        )}
                        {gps === "outside" && (
                          <ShieldAlert className="h-4 w-4 text-amber-500 mx-auto" />
                        )}
                        {gps === "unknown" && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.flag_reason ? (
                          <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 text-[10px]" title={c.flag_reason}>
                            Flagged
                          </Badge>
                        ) : (
                          <Badge variant={c.status === "checked_in" ? "default" : "secondary"}>
                            {c.status === "checked_in" ? "On-Site" : "Completed"}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
              <span>{filtered.length} check-in{filtered.length !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span>Page {page + 1} of {totalPages}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo preview dialog */}
      <Dialog open={!!photoDialog} onOpenChange={(open) => !open && setPhotoDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Job Photos
              {photoDialog?.jobId && jobMap.get(photoDialog.jobId) && (
                <span className="font-normal text-muted-foreground ml-2">— {jobMap.get(photoDialog.jobId)!.title}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {dialogPhotos.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No photos found</p>
          ) : (
            <div className="space-y-3">
              {["before", "during", "after", "completion"].map((type) => {
                const typePhotos = dialogPhotos.filter((p) => p.photo_type === type);
                if (typePhotos.length === 0) return null;
                return (
                  <div key={type}>
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1.5">{type}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {typePhotos.map((p) => (
                        <img
                          key={p.id}
                          src={p.photo_url}
                          alt={`${type} photo`}
                          className="rounded-md object-cover aspect-square w-full cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(p.photo_url, "_blank")}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
