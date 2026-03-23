const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "numeric",
  day: "numeric",
  year: "numeric",
});

const DATE_ONLY_LONG_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});

function getDateOnlyParts(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function createDateOnlyUtc(dateStr: string): Date {
  const { year, month, day } = getDateOnlyParts(dateStr);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatDateOnlyKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function parseDateOnlyLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateOnly(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return DATE_ONLY_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateOnlyLong(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return DATE_ONLY_LONG_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateOnlyKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateOnlyKeyFromLocalDate(date: Date): string {
  return formatDateOnlyKey(date);
}

export function getTodayDateOnlyKey(): string {
  return dateOnlyKeyFromLocalDate(new Date());
}

export function compareDateOnly(a: string, b: string): number {
  return a.localeCompare(b);
}

export function addDaysToDateOnly(dateStr: string, days: number): string {
  const date = createDateOnlyUtc(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnlyKeyUtc(date);
}

export function addMonthsToDateOnly(dateStr: string, months: number): string {
  const { year, month, day } = getDateOnlyParts(dateStr);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0, 12)).getUTCDate();
  return formatDateOnlyKeyUtc(new Date(Date.UTC(targetYear, normalizedMonthIndex, Math.min(day, lastDay), 12)));
}

type DateOnlyJob = {
  start_date: string;
  end_date: string | null;
  job_type?: string;
  recurring_interval?: string | null;
  recurring_end_date?: string | null;
};

export function getJobDateKeysInRange(
  job: DateOnlyJob,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const keys: string[] = [];

  if (job.job_type === "recurring" && job.recurring_interval) {
    let cursor = job.start_date;
    const horizon = job.recurring_end_date ?? rangeEnd;

    while (compareDateOnly(cursor, horizon) <= 0 && compareDateOnly(cursor, rangeEnd) <= 0) {
      if (compareDateOnly(cursor, rangeStart) >= 0) {
        keys.push(cursor);
      }

      if (job.recurring_interval === "monthly") {
        cursor = addMonthsToDateOnly(cursor, 1);
      } else if (job.recurring_interval === "weekly") {
        cursor = addDaysToDateOnly(cursor, 7);
      } else if (job.recurring_interval === "biweekly") {
        cursor = addDaysToDateOnly(cursor, 14);
      } else {
        break;
      }
    }

    return keys;
  }

  const end = job.end_date ?? job.start_date;
  let cursor = job.start_date;
  while (compareDateOnly(cursor, end) <= 0 && compareDateOnly(cursor, rangeEnd) <= 0) {
    if (compareDateOnly(cursor, rangeStart) >= 0) {
      keys.push(cursor);
    }
    cursor = addDaysToDateOnly(cursor, 1);
  }

  return keys;
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

  const todayKey = getTodayDateOnlyKey();
  const horizon = job.recurring_end_date ?? addDaysToDateOnly(todayKey, 366);
  let cursor = job.start_date;

  while (compareDateOnly(cursor, todayKey) < 0 && compareDateOnly(cursor, horizon) <= 0) {
    if (job.recurring_interval === "monthly") {
      cursor = addMonthsToDateOnly(cursor, 1);
    } else if (job.recurring_interval === "weekly") {
      cursor = addDaysToDateOnly(cursor, 7);
    } else if (job.recurring_interval === "biweekly") {
      cursor = addDaysToDateOnly(cursor, 14);
    } else {
      break;
    }
  }

  if (compareDateOnly(cursor, horizon) > 0) return job.start_date;
  return cursor;
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
    const todayKey = getTodayDateOnlyKey();
    const end = job.end_date ?? job.start_date;
    return compareDateOnly(todayKey, job.start_date) >= 0 && compareDateOnly(todayKey, end) <= 0;
  }

  const todayKey = getTodayDateOnlyKey();
  const nextInstance = getNextInstanceDate(job);
  return nextInstance === todayKey;
}