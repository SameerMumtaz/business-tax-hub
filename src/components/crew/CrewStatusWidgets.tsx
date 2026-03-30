import { useState, useEffect, useMemo } from "react";
import { Cloud, Clock, TrendingUp, TrendingDown, Minus, DollarSign, CheckCircle2, Droplets } from "lucide-react";
import { useWeatherForecast, type DailyWeather } from "@/hooks/useWeatherForecast";
import { getTodayDateOnlyKey, getNextInstanceDate } from "@/lib/dateOnly";
import type { AssignedJob } from "@/components/crew/CrewJobsList";

interface Props {
  jobs: AssignedJob[];
  activeCheckin: any;
  siteLat?: number | null;
  siteLng?: number | null;
  checkins?: any[];
  payRate?: number | null;
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

export default function CrewStatusWidgets({ jobs, activeCheckin, siteLat, siteLng, checkins, payRate }: Props) {
  const todayKey = getTodayDateOnlyKey();
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

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
    const todayJobs = jobs.filter(j => getNextInstanceDate(j) === todayKey);
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
      .filter(j => getNextInstanceDate(j) === todayKey)
      .filter(j => j.start_time)
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  }, [jobs, todayKey]);

  // All today's jobs (including completed, for progress)
  const allTodayJobs = useMemo(() => {
    return jobs.filter(j => getNextInstanceDate(j) === todayKey);
  }, [jobs, todayKey]);

  const completedCount = allTodayJobs.filter(j => j.status === "completed").length;
  const totalCount = allTodayJobs.length;

  // Today's earnings from checkins
  const todayEarnings = useMemo(() => {
    if (!checkins || !payRate) return null;
    const todayHours = checkins
      .filter(c => (c.occurrence_date || c.check_in_time?.slice(0, 10)) === todayKey)
      .reduce((sum: number, c: any) => {
        if (c.total_hours && c.total_hours > 0) return sum + c.total_hours;
        if (c.check_out_time) return sum + Math.max(0, (new Date(c.check_out_time).getTime() - new Date(c.check_in_time).getTime()) / 3600000);
        if (c.status === "checked_in") return sum + Math.max(0, (Date.now() - new Date(c.check_in_time).getTime()) / 3600000);
        return sum;
      }, 0);
    return Math.round(todayHours * payRate * 100) / 100;
  }, [checkins, payRate, todayKey]);

  // Next job
  const nextJob = useMemo(() => {
    const activeJobId = activeCheckin?.job_id;
    return todayJobsSorted.find(j => {
      if (j.id === activeJobId) return false;
      if (j.status === "completed") return false;
      const startMin = j.start_time ? timeToMinutes(j.start_time) : 0;
      return startMin > nowMinutes - 5;
    });
  }, [todayJobsSorted, activeCheckin, nowMinutes]);

  const minutesToNext = nextJob?.start_time
    ? Math.max(0, timeToMinutes(nextJob.start_time) - nowMinutes)
    : null;

  // Schedule pace
  const paceStatus = useMemo<{ label: string; color: string; icon: typeof TrendingUp }>(() => {
    if (!activeCheckin || todayJobsSorted.length === 0) {
      if (todayJobsSorted.length > 0 && todayJobsSorted[0].start_time) {
        const firstStart = timeToMinutes(todayJobsSorted[0].start_time);
        if (nowMinutes > firstStart + 10) {
          return { label: "Behind", color: "text-destructive", icon: TrendingDown };
        }
      }
      return { label: "On track", color: "text-primary", icon: Minus };
    }

    const checkinTime = new Date(activeCheckin.check_in_time);
    const elapsedMinutes = (Date.now() - checkinTime.getTime()) / 60_000;
    const expectedMinutes = (activeCheckin.expected_hours || 1) * 60;

    const activeJob = todayJobsSorted.find(j => j.id === activeCheckin.job_id);
    if (!activeJob?.start_time) {
      return { label: "On track", color: "text-primary", icon: Minus };
    }

    const scheduledStart = timeToMinutes(activeJob.start_time);
    const actualProgress = elapsedMinutes / expectedMinutes;
    const scheduleProgress = (nowMinutes - scheduledStart) / expectedMinutes;

    if (actualProgress > scheduleProgress + 0.15) {
      return { label: "Ahead", color: "text-emerald-600", icon: TrendingUp };
    }
    if (actualProgress < scheduleProgress - 0.15) {
      return { label: "Behind", color: "text-destructive", icon: TrendingDown };
    }
    return { label: "On track", color: "text-primary", icon: Minus };
  }, [activeCheckin, todayJobsSorted, nowMinutes]);

  const PaceIcon = paceStatus.icon;

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      {/* Weather + Temps */}
      {todayWeather && (
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5">
          <span className="text-base leading-none">{todayWeather.icon}</span>
          <span className="text-muted-foreground font-medium">{todayWeather.label}</span>
          <span className="font-semibold text-foreground">{todayWeather.tempHighF}°</span>
          <span className="text-muted-foreground">/ {todayWeather.tempLowF}°</span>
        </div>
      )}

      {/* Rain forecast */}
      {todayWeather && todayWeather.rainStartHour !== null && !todayWeather.isRainDay && (
        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-full px-3 py-1.5 text-blue-700 dark:text-blue-400">
          <Droplets className="h-3.5 w-3.5" />
          <span className="font-medium">
            Rain ~{todayWeather.rainStartHour > 12 ? `${todayWeather.rainStartHour - 12}pm` : todayWeather.rainStartHour === 0 ? "12am" : `${todayWeather.rainStartHour}am`}
          </span>
        </div>
      )}
      {todayWeather && todayWeather.isRainDay && (
        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-full px-3 py-1.5 text-blue-700 dark:text-blue-400">
          <Droplets className="h-3.5 w-3.5" />
          <span className="font-medium">Rain today</span>
        </div>
      )}

      {/* Jobs Remaining */}
      {totalCount > 0 && (
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{completedCount}/{totalCount}</span> done
          </span>
        </div>
      )}

      {/* Today's Earnings */}
      {todayEarnings !== null && (
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5">
          <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
          <span className="font-semibold text-foreground">${todayEarnings.toFixed(0)}</span>
          <span className="text-muted-foreground">today</span>
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
