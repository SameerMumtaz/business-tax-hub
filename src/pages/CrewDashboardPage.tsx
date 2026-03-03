import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useCrewCheckins } from "@/hooks/useCrewCheckins";
import { getCurrentPosition, isWithinGeofence, haversineDistance } from "@/lib/geofence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, LogIn, LogOut, CheckCircle, AlertTriangle, LogOut as SignOutIcon } from "lucide-react";
import { toast } from "sonner";
import LinkToBusinessCard from "@/components/LinkToBusinessCard";

interface AssignedJob {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  status: string;
  site: {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    geofence_radius: number | null;
  };
}

export default function CrewDashboardPage() {
  const { user, signOut } = useAuth();
  const { teamMemberId, businessUserId } = useTeamRole();
  const { activeCheckin, checkIn, checkOut } = useCrewCheckins();
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState<string | null>(null);

  useEffect(() => {
    const fetchAssignedJobs = async () => {
      if (!user || !teamMemberId) {
        setLoading(false);
        return;
      }

      const { data: assignments } = await supabase
        .from("job_assignments")
        .select("job_id")
        .eq("worker_id", teamMemberId);

      if (!assignments?.length) {
        setLoading(false);
        return;
      }

      const jobIds = assignments.map((a: any) => a.job_id);
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, title, start_date, end_date, status, site_id")
        .in("id", jobIds)
        .in("status", ["scheduled", "in_progress"]);

      if (!jobs?.length) {
        setLoading(false);
        return;
      }

      const siteIds = [...new Set(jobs.map((j: any) => j.site_id))];
      const { data: sites } = await supabase
        .from("job_sites")
        .select("id, name, address, latitude, longitude, geofence_radius")
        .in("id", siteIds);

      const siteMap = new Map((sites || []).map((s: any) => [s.id, s]));
      setAssignedJobs(
        jobs.map((j: any) => ({
          ...j,
          site: siteMap.get(j.site_id) || { id: j.site_id, name: "Unknown", address: null, latitude: null, longitude: null, geofence_radius: null },
        }))
      );
      setLoading(false);
    };

    fetchAssignedJobs();
  }, [user, teamMemberId]);

  const handleCheckIn = async (job: AssignedJob) => {
    setGpsLoading(job.id);
    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lng } = pos.coords;

      if (job.site.latitude != null && job.site.longitude != null) {
        const radius = job.site.geofence_radius || 150;
        if (!isWithinGeofence(lat, lng, job.site.latitude, job.site.longitude, radius)) {
          const dist = haversineDistance(lat, lng, job.site.latitude, job.site.longitude);
          toast.error(
            `You are ${Math.round(dist)}m from the job site. Must be within ${radius}m to check in.`
          );
          setGpsLoading(null);
          return;
        }
      }

      await checkIn(job.id, job.site.id, lat, lng);
    } catch (err: any) {
      toast.error(err.message || "Failed to get GPS location");
    }
    setGpsLoading(null);
  };

  const handleCheckOut = async () => {
    if (!activeCheckin) return;
    setGpsLoading("checkout");
    try {
      const pos = await getCurrentPosition();
      await checkOut(activeCheckin.id, pos.coords.latitude, pos.coords.longitude);
    } catch (err: any) {
      toast.error(err.message || "Failed to get GPS location");
    }
    setGpsLoading(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Jobs</h1>
            <p className="text-sm text-muted-foreground">
              Check in and out of your assigned job sites
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <SignOutIcon className="h-4 w-4 mr-1" />
            Sign Out
          </Button>
        </div>

        <LinkToBusinessCard />

        {activeCheckin && (
          <Card className="border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
                <CheckCircle className="h-4 w-4" />
                Currently Checked In
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Since {new Date(activeCheckin.check_in_time).toLocaleTimeString()}
              </div>
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleCheckOut}
                disabled={gpsLoading === "checkout"}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {gpsLoading === "checkout" ? "Getting location…" : "Check Out"}
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-muted-foreground text-center py-12">Loading jobs…</p>
        ) : assignedJobs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 space-y-2">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">No jobs assigned today</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {assignedJobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{job.title}</h3>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.site.name}
                        {job.site.address && ` — ${job.site.address}`}
                      </div>
                    </div>
                    <Badge variant="secondary">{job.status}</Badge>
                  </div>

                  {!job.site.latitude && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      No GPS coordinates set for this site — geofencing disabled
                    </div>
                  )}

                  {!activeCheckin && (
                    <Button
                      className="w-full"
                      onClick={() => handleCheckIn(job)}
                      disabled={gpsLoading === job.id}
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      {gpsLoading === job.id ? "Getting location…" : "Check In"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}