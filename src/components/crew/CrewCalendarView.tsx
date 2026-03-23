import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, MapPin } from "lucide-react";
import type { AssignedJob } from "./CrewJobsList";
import { addDaysToDateOnly, dateOnlyKeyFromLocalDate, formatDateOnlyLong, getJobDateKeysInRange, getTodayDateOnlyKey } from "@/lib/dateOnly";

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

  const toKey = (d: Date) => dateOnlyKeyFromLocalDate(d);
  const selectedDateKey = selectedDate ? toKey(selectedDate) : undefined;
  const rangeStart = jobs.reduce((earliest, job) => (job.start_date < earliest ? job.start_date : earliest), getTodayDateOnlyKey());
  const rangeEnd = jobs.reduce((latest, job) => {
    const candidate = job.recurring_end_date ?? job.end_date ?? addDaysToDateOnly(job.start_date, 366);
    return candidate > latest ? candidate : latest;
  }, addDaysToDateOnly(getTodayDateOnlyKey(), 366));

  jobs.forEach((job) => {
    const keys = getJobDateKeysInRange(job, job.start_date, rangeEnd);
    if (keys.length === 0) {
      const key = job.start_date;
      addJob(key, job);
      return;
    }

    keys.forEach((key) => addJob(key, job));
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

  const selectedJobs = selectedDateKey ? (jobDates.get(selectedDateKey) || []) : [];

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
            {selectedDateKey ? formatDateOnlyLong(selectedDateKey) : ""}
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
