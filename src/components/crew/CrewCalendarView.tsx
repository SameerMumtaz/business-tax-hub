import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, MapPin } from "lucide-react";
import type { AssignedJob } from "./CrewJobsList";

interface Props {
  jobs: AssignedJob[];
}

export default function CrewCalendarView({ jobs }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  // Build set of dates with jobs
  const jobDates = new Map<string, AssignedJob[]>();
  jobs.forEach((job) => {
    const key = new Date(job.start_date).toDateString();
    if (!jobDates.has(key)) jobDates.set(key, []);
    jobDates.get(key)!.push(job);
  });

  const modifiers = {
    hasJob: (date: Date) => jobDates.has(date.toDateString()),
  };

  const modifiersStyles = {
    hasJob: {
      backgroundColor: "hsl(var(--primary) / 0.15)",
      borderRadius: "50%",
      fontWeight: "bold" as const,
      color: "hsl(var(--primary))",
    },
  };

  const selectedJobs = selectedDate ? (jobDates.get(selectedDate.toDateString()) || []) : [];

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
