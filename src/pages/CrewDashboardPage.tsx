import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useCrewCheckins } from "@/hooks/useCrewCheckins";
import { getCurrentPosition, isWithinGeofence, haversineDistance } from "@/lib/geofence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Clock, LogOut, List, CalendarDays, MapPin as MapIcon, LogOut as SignOutIcon } from "lucide-react";
import { toast } from "sonner";
import LinkToBusinessCard from "@/components/LinkToBusinessCard";
import CrewJobsList, { type AssignedJob } from "@/components/crew/CrewJobsList";
import CrewCalendarView from "@/components/crew/CrewCalendarView";
import CrewMapView from "@/components/crew/CrewMapView";

export default function CrewDashboardPage() {
  const { user, signOut } = useAuth();
  const { teamMemberId, businessUserId } = useTeamRole();
  const { activeCheckin, checkIn, checkOut } = useCrewCheckins();
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState<string | null>(null);
  const [payRate, setPayRate] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !teamMemberId) {
        setLoading(false);
        return;
      }

      // Fetch pay rate for this team member
      const { data: memberData } = await supabase
        .from("team_members")
        .select("pay_rate")
        .eq("id", teamMemberId)
        .single();
      
      const rate = memberData?.pay_rate ?? null;
      setPayRate(rate);

      // Fetch assignments
      const { data: assignments } = await supabase
        .from("job_assignments")
        .select("job_id")
        .eq("worker_id", teamMemberId);

      if (!assignments?.length) {
        setAssignedJobs([]);
        setLoading(false);
        return;
      }

      const jobIds = assignments.map((a: any) => a.job_id);
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, title, description, start_date, end_date, status, site_id")
        .in("id", jobIds)
        .in("status", ["scheduled", "in_progress"]);

      if (!jobs?.length) {
        setAssignedJobs([]);
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
        jobs.map((j: any) => {
          // Estimate hours from start/end date if both present
          let expectedHours: number | null = null;
          if (j.end_date) {
            const diff = new Date(j.end_date).getTime() - new Date(j.start_date).getTime();
            expectedHours = Math.round((diff / (1000 * 60 * 60)) * 10) / 10;
            if (expectedHours > 24) expectedHours = 8; // default for multi-day
          }
          
          return {
            ...j,
            site: siteMap.get(j.site_id) || {
              id: j.site_id, name: "Unknown", address: null,
              latitude: null, longitude: null, geofence_radius: null,
            },
            expectedHours,
            expectedPay: expectedHours && rate ? Math.round(expectedHours * rate * 100) / 100 : null,
          };
        })
      );
      setLoading(false);
    };

    fetchData();
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
          toast.error(`You are ${Math.round(dist)}m away. Must be within ${radius}m.`);
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
              View your schedule, check in, and get directions
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
              {payRate && (
                <div className="text-xs text-muted-foreground">
                  Rate: ${payRate}/hr
                </div>
              )}
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
        ) : (
          <Tabs defaultValue="list">
            <TabsList className="w-full">
              <TabsTrigger value="list" className="flex-1 gap-1.5">
                <List className="h-4 w-4" /> Jobs
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex-1 gap-1.5">
                <CalendarDays className="h-4 w-4" /> Calendar
              </TabsTrigger>
              <TabsTrigger value="map" className="flex-1 gap-1.5">
                <MapIcon className="h-4 w-4" /> Map
              </TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="mt-4">
              <CrewJobsList
                jobs={assignedJobs}
                activeCheckin={activeCheckin}
                gpsLoading={gpsLoading}
                onCheckIn={handleCheckIn}
              />
            </TabsContent>
            <TabsContent value="calendar" className="mt-4">
              <CrewCalendarView jobs={assignedJobs} />
            </TabsContent>
            <TabsContent value="map" className="mt-4">
              <CrewMapView jobs={assignedJobs} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
