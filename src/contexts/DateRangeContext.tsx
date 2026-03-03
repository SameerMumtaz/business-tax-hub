import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

export type DatePreset = "ytd" | "prior_year" | "all_time" | "custom";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  preset: DatePreset;
}

interface DateRangeContextType {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  setPreset: (preset: DatePreset) => void;
  filterByDate: <T extends { date: string }>(items: T[]) => T[];
}

const now = new Date();
const currentYear = now.getFullYear();

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  switch (preset) {
    case "ytd":
      return { from: `${currentYear}-01-01`, to: `${currentYear}-12-31` };
    case "prior_year":
      return { from: `${currentYear - 1}-01-01`, to: `${currentYear - 1}-12-31` };
    case "all_time":
      return { from: "2000-01-01", to: "2099-12-31" };
    case "custom":
    default:
      return { from: `${currentYear}-01-01`, to: `${currentYear}-12-31` };
  }
}

const defaultRange: DateRange = { ...getPresetRange("ytd"), preset: "ytd" };

const DateRangeContext = createContext<DateRangeContextType>({
  dateRange: defaultRange,
  setDateRange: () => {},
  setPreset: () => {},
  filterByDate: (items) => items,
});

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange);

  const setPreset = useCallback((preset: DatePreset) => {
    const range = getPresetRange(preset);
    setDateRange({ ...range, preset });
  }, []);

  const filterByDate = useCallback(
    <T extends { date: string }>(items: T[]): T[] => {
      if (dateRange.preset === "all_time") return items;
      return items.filter((item) => item.date >= dateRange.from && item.date <= dateRange.to);
    },
    [dateRange]
  );

  const value = useMemo(() => ({ dateRange, setDateRange, setPreset, filterByDate }), [dateRange, setPreset, filterByDate]);

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  return useContext(DateRangeContext);
}
