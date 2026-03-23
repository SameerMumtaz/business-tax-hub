import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, MapPin } from "lucide-react";
import type { AssignedJob } from "./CrewJobsList";
import { addDaysToDateOnly, dateOnlyKeyFromLocalDate, formatDateOnlyLong, getJobDateKeysInRange, getTodayDateOnlyKey } from "@/lib/dateOnly";

interface CrewOccurrence {
  job_id: string | null;
  occurrence_date: string | null;
  status: string;
  check_in_time: string;
}

interface Props {
  jobs: AssignedJob[];
  checkins?: CrewOccurrence[];
}

function getOccurrenceStatus(job: AssignedJob, dateKey: string, checkins: CrewOccurrence[]) {
  if (job.job_type !== "recurring") return job.status;

  const latest = checkins
    .filter((entry) => entry.job_id === job.id && entry.occurrence_date === dateKey)
    .sort((a, b) => b.check_in_time.localeCompare(a.check_in_time))[0];

  if (!latest) return "scheduled";
  if (latest.status === "checked_in") return "in_progress";
  if (latest.status === "checked_out") return "completed";
  return "scheduled";
}

export default function CrewCalendarView({ jobs, checkins = [] }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const jobDates = useMemo(() => {
    const map = new Map<string, (AssignedJob & { displayStatus: string })[]>();
    const addJob = (dateStr: string, job: AssignedJob & { displayStatus: string }) => {
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(job);
    };

    const rangeEnd = jobs.reduce((latest, job) => {
      const candidate = job.recurring_end_date ?? job.end_date ?? addDaysToDateOnly(job.start_date, 366);
      return candidate > latest ? candidate : latest;
    }, addDaysToDateOnly(getTodayDateOnlyKey(), 366));

    jobs.forEach((job) => {
      const keys = getJobDateKeysInRange(job, job.start_date, rangeEnd);
      if (keys.length === 0) {
        addJob(job.start_date, { ...job, displayStatus: getOccurrenceStatus(job, job.start_date, checkins) });
        return;
      }

      keys.forEach((key) => {
        addJob(key, { ...job, displayStatus: getOccurrenceStatus(job, key, checkins) });
      });
    });

    return map;
  }, [jobs, checkins]);

  const toKey = (d: Date) => dateOnlyKeyFromLocalDate(d);
  const selectedDateKey = selectedDate ? toKey(selectedDate) : undefined;

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
              <Card key={`${job.id}-${selectedDateKey}`}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{job.title}</h4>
                    <Badge variant="secondary" className="text-xs">{job.displayStatus}</Badge>
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
