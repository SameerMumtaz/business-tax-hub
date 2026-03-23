import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, MapPin } from "lucide-react";
import type { AssignedJob } from "./CrewJobsList";
import { formatDateOnlyKey, parseDateOnlyLocal } from "@/lib/dateOnly";

interface Props {
  jobs: AssignedJob[];
}

export default function CrewCalendarView({ jobs }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  // Build set of dates with jobs (including recurring instances)
  const jobDates = new Map<string, AssignedJob[]>();

  const addJob = (dateStr: string, job: AssignedJob) => {
    if (!jobDates.has(dateStr)) jobDates.set(dateStr, []);
    jobDates.get(dateStr)!.push(job);
  };

  const toKey = (d: Date) => formatDateOnlyKey(d);

  // Generate up to 1 year of recurring instances
  const horizon = new Date();
  horizon.setFullYear(horizon.getFullYear() + 1);

  jobs.forEach((job) => {
    if (job.job_type === "recurring" && job.recurring_interval) {
      const start = parseLocal(job.start_date);
      const start = parseDateOnlyLocal(job.start_date);
      const endDate = job.recurring_end_date ? parseDateOnlyLocal(job.recurring_end_date) : horizon;
      const intervalDays = job.recurring_interval === "weekly" ? 7
        : job.recurring_interval === "biweekly" ? 14 : 0;

      const cursor = new Date(start);
      while (cursor <= endDate) {
        addJob(toKey(cursor), job);
        if (job.recurring_interval === "monthly") {
          cursor.setMonth(cursor.getMonth() + 1);
        } else if (intervalDays > 0) {
          cursor.setDate(cursor.getDate() + intervalDays);
        } else {
          break;
        }
      }
    } else {
      const key = toKey(parseDateOnlyLocal(job.start_date));
      addJob(key, job);
    }
  });

  const modifiers = {
    hasJob: (date: Date) => jobDates.has(toKey(date)),
  };

  const modifiersStyles = {
    hasJob: {
      backgroundColor: "hsl(var(--primary) / 0.15)",
      borderRadius: "50%",
      fontWeight: "bold" as const,
      color: "hsl(var(--primary))",
    },
  };

  const selectedJobs = selectedDate ? (jobDates.get(toKey(selectedDate)) || []) : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex justify-center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={modifiers}
            modifiersStyles={modifiersStyles}
          />
        </CardContent>
      </Card>

      {selectedDate && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h3>
          {selectedJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs scheduled</p>
          ) : (
            selectedJobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{job.title}</h4>
                    <Badge variant="secondary" className="text-xs">{job.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{job.site.name}
                    </span>
                    {job.expectedHours != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />{job.expectedHours}h
                      </span>
                    )}
                    {job.expectedPay != null && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />${job.expectedPay.toFixed(2)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
