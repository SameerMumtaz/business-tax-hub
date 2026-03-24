import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, Play, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTodayDateOnlyKey, getJobDateKeysInRange } from "@/lib/dateOnly";

interface Job {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  estimated_hours: number | null;
  job_type: string;
  status: string;
  recurring_interval?: string | null;
  recurring_end_date?: string | null;
}

interface Assignment {
  job_id: string;
  worker_id: string;
  worker_name: string;
}

interface CheckinRecord {
  id: string;
  job_id: string | null;
  team_member_id: string;
  check_in_time: string;
  check_out_time: string | null;
  occurrence_date: string | null;
  status: string;
}

interface Props {
  jobs: Job[];
  assignments: Assignment[];
  checkins: CheckinRecord[];
}

function timeToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatTime(time: string | null): string {
  if (!time) return "No time set";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

export default function CheckInProgressWidget({ jobs, assignments, checkins }: Props) {
  const todayKey = getTodayDateOnlyKey();
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const analysis = useMemo(() => {
    // Find all jobs that have an instance today
    const todayJobs: (Job & { assignedWorkers: number; workerNames: string[] })[] = [];
    
    for (const job of jobs) {
      if (job.status === "cancelled") continue;
      
      let isToday = false;
      if (job.job_type === "recurring" && job.recurring_interval) {
        const instances = getJobDateKeysInRange(job, todayKey, todayKey);
        isToday = instances.includes(todayKey);
      } else {
        const end = job.end_date ?? job.start_date;
        isToday = todayKey >= job.start_date && todayKey <= end;
      }
      
      if (!isToday) continue;
      
      const jobAssignments = assignments.filter((a) => a.job_id === job.id);
      todayJobs.push({
        ...job,
        assignedWorkers: jobAssignments.length,
        workerNames: jobAssignments.map((a) => a.worker_name),
      });
    }
    
    // Sort by start_time
    todayJobs.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    
    // Categorize jobs by current time
    const todayCheckins = checkins.filter((c) => {
      const checkinDate = c.occurrence_date || new Date(c.check_in_time).toISOString().split("T")[0];
      return checkinDate === todayKey;
    });
    
    let expectedCheckins = 0; // Workers who should have checked in by now
    let totalExpectedToday = 0; // Total workers expected today
    let completedJobs = 0;
    let inProgressJobs = 0;
    let notStartedPastDue = 0; // count of past-due WORKERS, not jobs
    let upcomingJobs = 0;
    let pastDueJobCount = 0;
    
    const jobDetails: {
      id: string;
      title: string;
      startTime: string | null;
      assignedWorkers: number;
      actualCheckins: number;
      status: "completed" | "in_progress" | "missed" | "upcoming" | "not_started";
    }[] = [];
    
    for (const job of todayJobs) {
      const jobStartMinutes = timeToMinutes(job.start_time);
      const jobHasStarted = job.start_time ? currentMinutes >= jobStartMinutes : false;
      
      totalExpectedToday += job.assignedWorkers;
      
      // Count actual check-ins for this job today
      const jobCheckins = todayCheckins.filter((c) => c.job_id === job.id);
      const checkedOutCount = jobCheckins.filter((c) => c.check_out_time).length;
      const stillCheckedIn = jobCheckins.filter((c) => !c.check_out_time).length;
      
      let jobStatus: "completed" | "in_progress" | "missed" | "upcoming" | "not_started";
      
      if (checkedOutCount > 0 && checkedOutCount >= job.assignedWorkers) {
        jobStatus = "completed";
        completedJobs++;
        expectedCheckins += job.assignedWorkers;
      } else if (stillCheckedIn > 0) {
        jobStatus = "in_progress";
        inProgressJobs++;
        expectedCheckins += job.assignedWorkers;
      } else if (jobHasStarted && jobCheckins.length === 0) {
        jobStatus = "missed";
        notStartedPastDue += job.assignedWorkers;
        pastDueJobCount++;
        expectedCheckins += job.assignedWorkers;
      } else if (!jobHasStarted) {
        jobStatus = "upcoming";
        upcomingJobs++;
      } else {
        jobStatus = "not_started";
        expectedCheckins += job.assignedWorkers;
      }
      
      jobDetails.push({
        id: job.id,
        title: job.title,
        startTime: job.start_time,
        assignedWorkers: job.assignedWorkers,
        actualCheckins: jobCheckins.length,
        status: jobStatus,
      });
    }
    
    const actualCheckinsCount = todayCheckins.length;
    
    return {
      todayJobs: todayJobs.length,
      totalExpectedToday,
      expectedCheckins,
      actualCheckinsCount,
      completedJobs,
      inProgressJobs,
      notStartedPastDue,
      upcomingJobs,
      jobDetails,
    };
  }, [jobs, assignments, checkins, todayKey, currentMinutes]);

  const progressPct = analysis.expectedCheckins > 0
    ? Math.round((analysis.actualCheckinsCount / analysis.expectedCheckins) * 100)
    : 0;

  if (analysis.todayJobs === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Today's Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No jobs scheduled today</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Today's Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Main metric */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">
            {analysis.actualCheckinsCount}/{analysis.expectedCheckins}
          </span>
          <span className="text-sm text-muted-foreground">
            check-ins so far
          </span>
        </div>
        
        <Progress value={Math.min(100, progressPct)} className="h-2" />

        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5">
          {analysis.completedJobs > 0 && (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1">
              <CheckCircle className="h-3 w-3" />
              {analysis.completedJobs} completed
            </Badge>
          )}
          {analysis.inProgressJobs > 0 && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 gap-1">
              <Play className="h-3 w-3" />
              {analysis.inProgressJobs} in progress
            </Badge>
          )}
          {analysis.notStartedPastDue > 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
              <AlertTriangle className="h-3 w-3" />
              {analysis.notStartedPastDue} past due
            </Badge>
          )}
          {analysis.upcomingJobs > 0 && (
            <Badge variant="secondary" className="text-muted-foreground gap-1">
              <Clock className="h-3 w-3" />
              {analysis.upcomingJobs} upcoming
            </Badge>
          )}
        </div>

        {/* Job timeline */}
        <div className="space-y-1 pt-1">
          {analysis.jobDetails.map((job) => (
            <div
              key={job.id}
              className={cn(
                "flex items-center justify-between text-xs rounded px-2 py-1.5",
                job.status === "completed" && "bg-emerald-50 dark:bg-emerald-900/10",
                job.status === "in_progress" && "bg-blue-50 dark:bg-blue-900/10",
                job.status === "missed" && "bg-amber-50 dark:bg-amber-900/10",
                job.status === "upcoming" && "bg-muted/50",
                job.status === "not_started" && "bg-muted/50",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0",
                  job.status === "completed" && "bg-emerald-500",
                  job.status === "in_progress" && "bg-blue-500 animate-pulse",
                  job.status === "missed" && "bg-amber-500",
                  job.status === "upcoming" && "bg-muted-foreground/30",
                  job.status === "not_started" && "bg-muted-foreground/30",
                )} />
                <span className="truncate font-medium">{job.title}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-muted-foreground">{formatTime(job.startTime)}</span>
                <span className="font-mono">
                  {job.actualCheckins}/{job.assignedWorkers}
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {/* Total summary */}
        <div className="text-xs text-muted-foreground pt-1 border-t border-border">
          {analysis.todayJobs} jobs today · {analysis.totalExpectedToday} total workers expected
        </div>
      </CardContent>
    </Card>
  );
}
