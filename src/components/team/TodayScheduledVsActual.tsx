import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getJobDateKeysInRange } from "@/lib/dateOnly";

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
  hours_per_day?: number;
  assigned_days?: string[] | null;
}

interface CheckinRecord {
  id: string;
  job_id: string | null;
  team_member_id: string;
  check_in_time: string;
  check_out_time: string | null;
  total_hours: number | null;
  occurrence_date: string | null;
  status: string;
}

interface TeamMember {
  id: string;
  name: string;
}

interface Props {
  jobs: Job[];
  assignments: Assignment[];
  checkins: CheckinRecord[];
  members: TeamMember[];
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TodayScheduledVsActual({ jobs, assignments, checkins, members }: Props) {
  const today = formatDateStr(new Date());

  const analysis = useMemo(() => {
    const memberMap = new Map(members.map((m) => [m.id, m]));
    const workerData = new Map<string, {
      name: string;
      scheduledHours: number;
      actualHours: number;
      jobCount: number;
    }>();

    // Scheduled hours for today
    for (const job of jobs) {
      if (job.status === "cancelled") continue;

      let runsToday = false;
      if (job.job_type === "recurring" && job.recurring_interval) {
        const dates = getJobDateKeysInRange(job, today, today);
        runsToday = dates.length > 0;
      } else {
        const jEnd = job.end_date ?? job.start_date;
        runsToday = today >= job.start_date && today <= jEnd;
      }
      if (!runsToday) continue;

      const jobAssigns = assignments.filter((a) => a.job_id === job.id);
      for (const assign of jobAssigns) {
        if (assign.assigned_days?.length && !assign.assigned_days.includes(today)) continue;
        const hpd = assign.hours_per_day && assign.hours_per_day > 0 ? assign.hours_per_day : (job.estimated_hours || 8);

        if (!workerData.has(assign.worker_id)) {
          const member = memberMap.get(assign.worker_id);
          workerData.set(assign.worker_id, { name: member?.name || assign.worker_name, scheduledHours: 0, actualHours: 0, jobCount: 0 });
        }
        const data = workerData.get(assign.worker_id)!;
        data.scheduledHours += hpd;
        data.jobCount++;
      }
    }

    // Actual hours from today's check-ins
    const todayCheckins = checkins.filter((c) => (c.occurrence_date || c.check_in_time.split("T")[0]) === today);
    for (const c of todayCheckins) {
      if (!workerData.has(c.team_member_id)) {
        const member = memberMap.get(c.team_member_id);
        workerData.set(c.team_member_id, { name: member?.name || "Unknown", scheduledHours: 0, actualHours: 0, jobCount: 0 });
      }
      const data = workerData.get(c.team_member_id)!;
      let hours = 0;
      if (c.total_hours && c.total_hours > 0) hours = c.total_hours;
      else if (c.check_out_time) hours = Math.round((new Date(c.check_out_time).getTime() - new Date(c.check_in_time).getTime()) / 3600000 * 4) / 4;
      else if (c.status === "checked_in") hours = Math.round((Date.now() - new Date(c.check_in_time).getTime()) / 3600000 * 4) / 4;
      data.actualHours += hours;
    }

    const workers = Array.from(workerData.entries())
      .map(([id, data]) => ({ id, ...data, variance: data.actualHours - data.scheduledHours }))
      .sort((a, b) => a.variance - b.variance);

    const totalScheduled = workers.reduce((s, w) => s + w.scheduledHours, 0);
    const totalActual = workers.reduce((s, w) => s + w.actualHours, 0);
    return { workers, totalScheduled, totalActual };
  }, [jobs, assignments, checkins, members, today]);

  const totalVariance = analysis.totalActual - analysis.totalScheduled;
  const completionPct = analysis.totalScheduled > 0 ? Math.min(100, Math.round((analysis.totalActual / analysis.totalScheduled) * 100)) : 0;

  if (analysis.workers.length === 0) return null;

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Today's Scheduled vs. Actual
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">{analysis.totalActual.toFixed(1)}h / {analysis.totalScheduled.toFixed(1)}h scheduled</span>
              <span className={cn("font-medium", totalVariance > 0 && "text-amber-600 dark:text-amber-400", totalVariance < 0 && "text-destructive", totalVariance === 0 && "text-emerald-600 dark:text-emerald-400")}>
                {totalVariance > 0 ? "+" : ""}{totalVariance.toFixed(1)}h
              </span>
            </div>
            <Progress value={completionPct} className="h-2" />
          </div>
          <span className="text-lg font-bold font-mono">{completionPct}%</span>
        </div>

        <div className="space-y-1.5">
          {analysis.workers.map((w) => {
            const isOver = w.variance > 0.25;
            const isUnder = w.variance < -0.25;
            return (
              <div key={w.id} className={cn("flex items-center justify-between rounded-lg border px-3 py-2", isOver && "border-amber-200 dark:border-amber-800/50", isUnder && "border-destructive/30")}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-sm truncate">{w.name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{w.jobCount} job{w.jobCount !== 1 ? "s" : ""}</Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground font-mono">{w.actualHours.toFixed(1)}h / {w.scheduledHours.toFixed(1)}h</span>
                  <Badge variant="secondary" className={cn("text-[10px] gap-0.5", isOver && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", isUnder && "bg-destructive/10 text-destructive", !isOver && !isUnder && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400")}>
                    {isOver && <TrendingUp className="h-3 w-3" />}
                    {isUnder && <TrendingDown className="h-3 w-3" />}
                    {!isOver && !isUnder && <Minus className="h-3 w-3" />}
                    {w.variance > 0 ? "+" : ""}{w.variance.toFixed(1)}h
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
