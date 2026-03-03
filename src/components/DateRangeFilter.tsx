import { useDateRange, DatePreset } from "@/contexts/DateRangeContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CalendarDays } from "lucide-react";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "ytd", label: "Year to Date" },
  { value: "prior_year", label: "Prior Year" },
  { value: "all_time", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

export default function DateRangeFilter() {
  const { dateRange, setPreset, setDateRange } = useDateRange();

  return (
    <div className="flex items-center gap-2">
      <CalendarDays className="h-4 w-4 text-muted-foreground" />
      <Select value={dateRange.preset} onValueChange={(v) => setPreset(v as DatePreset)}>
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {dateRange.preset === "custom" && (
        <>
          <Input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            className="h-8 w-[140px] text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            className="h-8 w-[140px] text-xs"
          />
        </>
      )}
    </div>
  );
}
