import { useState, useEffect, useMemo } from "react";
import { Cloud, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useWeatherForecast, type DailyWeather } from "@/hooks/useWeatherForecast";
import { getTodayDateOnlyKey, getNextInstanceDate } from "@/lib/dateOnly";
import type { AssignedJob } from "@/components/crew/CrewJobsList";

interface Props {
  jobs: AssignedJob[];
  activeCheckin: any;
  siteLat?: number | null;
  siteLng?: number | null;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatCountdown(totalMinutes: number): string {
  if (totalMinutes <= 0) return "Now";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function CrewStatusWidgets({ jobs, activeCheckin, siteLat, siteLng }: Props) {
  const todayKey = getTodayDateOnlyKey();
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  // Update clock every 30s
  useEffect(() => {
    const update = () => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    };
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  // Weather — use centroid of today's job sites
  const centroid = useMemo(() => {
    const todayJobs = jobs.filter(j => {
      const d = getNextInstanceDate(j);
      return d === todayKey;
    });
    const lats: number[] = [];
    const lngs: number[] = [];
    todayJobs.forEach(j => {
      if (j.site.latitude && j.site.longitude) {
        lats.push(j.site.latitude);
        lngs.push(j.site.longitude);
      }
    });
    if (lats.length === 0) return { lat: siteLat || null, lng: siteLng || null };
    return {
      lat: lats.reduce((a, b) => a + b, 0) / lats.length,
      lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
    };
  }, [jobs, todayKey, siteLat, siteLng]);

  const { data: weatherMap } = useWeatherForecast(centroid.lat, centroid.lng);
  const todayWeather: DailyWeather | undefined = weatherMap?.get(todayKey);

  // Today's jobs sorted by start_time
  const todayJobsSorted = useMemo(() => {
    return jobs
      .filter(j => {
        const d = getNextInstanceDate(j);
        return d === todayKey && j.status !== "completed";
      })
      .filter(j => j.start_time)
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  }, [jobs, todayKey]);

  // Next job (upcoming, not currently checked into)
  const nextJob = useMemo(() => {
    const activeJobId = activeCheckin?.job_id;
    return todayJobsSorted.find(j => {
      if (j.id === activeJobId) return false;
      const startMin = j.start_time ? timeToMinutes(j.start_time) : 0;
      return startMin > nowMinutes - 5; // within 5 min grace
    });
  }, [todayJobsSorted, activeCheckin, nowMinutes]);

  const minutesToNext = nextJob?.start_time
    ? Math.max(0, timeToMinutes(nextJob.start_time) - nowMinutes)
    : null;

  // Schedule pace: compare where we "should" be vs where we are
  const paceStatus = useMemo<{ label: string; color: string; icon: typeof TrendingUp }>(() => {
    if (!activeCheckin || todayJobsSorted.length === 0) {
      // Not checked in — are we late for first job?
      if (todayJobsSorted.length > 0 && todayJobsSorted[0].start_time) {
        const firstStart = timeToMinutes(todayJobsSorted[0].start_time);
        if (nowMinutes > firstStart + 10) {
          return { label: "Behind", color: "text-destructive", icon: TrendingDown };
        }
      }
      return { label: "On track", color: "text-primary", icon: Minus };
    }

    // Currently checked in — compute expected finish vs actual elapsed
    const checkinTime = new Date(activeCheckin.check_in_time);
    const elapsedMinutes = (Date.now() - checkinTime.getTime()) / 60_000;
    const expectedMinutes = (activeCheckin.expected_hours || 1) * 60;

    // How far through the current job should we be?
    const activeJob = todayJobsSorted.find(j => j.id === activeCheckin.job_id);
    if (!activeJob?.start_time) {
      return { label: "On track", color: "text-primary", icon: Minus };
    }

    const scheduledStart = timeToMinutes(activeJob.start_time);
    const scheduledEnd = scheduledStart + expectedMinutes;
    const actualProgress = elapsedMinutes / expectedMinutes; // 0-1+
    const scheduleProgress = (nowMinutes - scheduledStart) / expectedMinutes; // 0-1+

    // If we're more than 15% ahead
    if (actualProgress > scheduleProgress + 0.15) {
      return { label: "Ahead", color: "text-emerald-600", icon: TrendingUp };
    }
    // If we're more than 15% behind
    if (actualProgress < scheduleProgress - 0.15) {
      return { label: "Behind", color: "text-destructive", icon: TrendingDown };
    }
    return { label: "On track", color: "text-primary", icon: Minus };
  }, [activeCheckin, todayJobsSorted, nowMinutes]);

  const PaceIcon = paceStatus.icon;

  return (
    <div className="flex items-center gap-3 text-xs flex-wrap">
      {/* Weather */}
      {todayWeather && (
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5">
          <span className="text-base leading-none">{todayWeather.icon}</span>
          <span className="text-muted-foreground font-medium">{todayWeather.label}</span>
        </div>
      )}

      {/* Next job countdown */}
      {minutesToNext !== null && nextJob && (
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">
            Next: <span className="font-semibold text-foreground">{formatCountdown(minutesToNext)}</span>
          </span>
        </div>
      )}

      {/* Schedule pace */}
      {todayJobsSorted.length > 0 && (
        <div className={`flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5 ${paceStatus.color}`}>
          <PaceIcon className="h-3.5 w-3.5" />
          <span className="font-semibold">{paceStatus.label}</span>
        </div>
      )}
    </div>
  );
}
