const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "numeric",
  day: "numeric",
  year: "numeric",
});

export function parseDateOnlyLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateOnly(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return DATE_ONLY_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateOnlyKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * For a recurring job, find the nearest instance date (today or next upcoming).
 * For one-time jobs, returns the start_date as-is.
 */
export function getNextInstanceDate(job: {
  start_date: string;
  end_date: string | null;
  job_type?: string;
  recurring_interval?: string | null;
  recurring_end_date?: string | null;
}): string {
  if (job.job_type !== "recurring" || !job.recurring_interval) {
    return job.start_date;
  }

  const start = parseDateOnlyLocal(job.start_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const horizon = job.recurring_end_date
    ? parseDateOnlyLocal(job.recurring_end_date)
    : new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());

  const intervalDays =
    job.recurring_interval === "weekly" ? 7 :
    job.recurring_interval === "biweekly" ? 14 : 0;

  const cursor = new Date(start);
  while (cursor < today && cursor <= horizon) {
    if (job.recurring_interval === "monthly") {
      cursor.setMonth(cursor.getMonth() + 1);
    } else if (intervalDays > 0) {
      cursor.setDate(cursor.getDate() + intervalDays);
    } else {
      break;
    }
  }

  if (cursor > horizon) return job.start_date;
  return formatDateOnlyKey(cursor);
}

/**
 * Check if today falls on any recurring instance of a job.
 */
export function isRecurringJobToday(job: {
  start_date: string;
  end_date: string | null;
  job_type?: string;
  recurring_interval?: string | null;
  recurring_end_date?: string | null;
}): boolean {
  if (job.job_type !== "recurring" || !job.recurring_interval) {
    // One-time job: simple date range check
    const now = Date.now();
    const startMs = parseDateOnlyLocal(job.start_date).setHours(0, 0, 0, 0);
    const endDate = job.end_date ? parseDateOnlyLocal(job.end_date) : parseDateOnlyLocal(job.start_date);
    const endMs = endDate.setHours(23, 59, 59, 999);
    return now >= startMs && now <= endMs;
  }

  const todayKey = formatDateOnlyKey(new Date());
  const nextInstance = getNextInstanceDate(job);
  return nextInstance === todayKey;
}