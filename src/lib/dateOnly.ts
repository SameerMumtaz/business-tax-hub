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