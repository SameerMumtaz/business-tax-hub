import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, Clock, Eye } from "lucide-react";
import MembersContent from "@/components/team/MembersContent";
import JobSchedulerContent from "@/components/team/JobSchedulerContent";
import TimesheetsContent from "@/components/team/TimesheetsContent";
import CrewMapContent from "@/components/team/CrewMapContent";

export default function TeamPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const initialTab = params.get("tab") || "supervisor";
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const t = p.get("tab") || "supervisor";
    setTab(t);
  }, [location.search]);

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    navigate(newTab === "supervisor" ? "/team" : `/team?tab=${newTab}`, { replace: true });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage your team, schedule jobs, track hours, and monitor crew locations
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="supervisor" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" />Supervisor
            </TabsTrigger>
            <TabsTrigger value="scheduler" className="gap-1.5">
              <Calendar className="h-3.5 w-3.5" />Schedule
            </TabsTrigger>
            <TabsTrigger value="timesheets" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />Timesheets
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />Members
            </TabsTrigger>
          </TabsList>

          <TabsContent value="supervisor" className="mt-4">
            <CrewMapContent />
          </TabsContent>
          <TabsContent value="members" className="mt-4">
            <MembersContent />
          </TabsContent>
          <TabsContent value="scheduler" className="mt-4">
            <JobSchedulerContent />
          </TabsContent>
          <TabsContent value="timesheets" className="mt-4">
            <TimesheetsContent />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
