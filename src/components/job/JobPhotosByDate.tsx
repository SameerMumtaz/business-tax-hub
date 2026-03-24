import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";
import JobPhotosPanel from "./JobPhotosPanel";
import { formatDateOnly } from "@/lib/dateOnly";

interface Props {
  jobId: string;
  jobType?: string;
}

/**
 * For recurring jobs, shows a date picker so managers can browse photos by visit date.
 * For one-time jobs, renders photos directly.
 */
export default function JobPhotosByDate({ jobId, jobType }: Props) {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isRecurring = jobType === "recurring";

  useEffect(() => {
    if (!isRecurring) return;

    setLoading(true);
    // Fetch distinct occurrence dates that have photos for this job
    supabase
      .from("job_photos")
      .select("occurrence_date")
      .eq("job_id", jobId)
      .not("occurrence_date", "is", null)
      .order("occurrence_date", { ascending: false })
      .then(({ data }) => {
        const unique = [...new Set((data || []).map((r: any) => r.occurrence_date as string).filter(Boolean))];
        setDates(unique);
        if (unique.length > 0 && !selectedDate) {
          setSelectedDate(unique[0]);
        }
        setLoading(false);
      });
  }, [jobId, isRecurring]);

  // One-time job: show all photos directly
  if (!isRecurring) {
    return <JobPhotosPanel jobId={jobId} />;
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-4">Loading visit dates…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          Visit Date
        </div>
        {dates.length > 0 ? (
          <Select value={selectedDate || ""} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Select date" />
            </SelectTrigger>
            <SelectContent>
              {dates.map((d) => (
                <SelectItem key={d} value={d}>
                  {formatDateOnly(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">No visits with photos yet</span>
        )}
        {dates.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {dates.length} visit{dates.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {selectedDate ? (
        <JobPhotosPanel jobId={jobId} occurrenceDate={selectedDate} />
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">
          No photos uploaded for this recurring job yet.
        </p>
      )}
    </div>
  );
}
