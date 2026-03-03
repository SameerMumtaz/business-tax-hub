import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { CHART_COLORS, TOOLTIP_STYLE } from "@/lib/chartTheme";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from "recharts";
import { X, ArrowLeft } from "lucide-react";
import type { Expense } from "@/types/tax";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allExpenses: Expense[];
}

const DATE_RANGES = [
  { value: "all", label: "All Time" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "ytd", label: "Year to Date" },
  { value: "q1", label: "Q1 (Jan–Mar)" },
  { value: "q2", label: "Q2 (Apr–Jun)" },
  { value: "q3", label: "Q3 (Jul–Sep)" },
  { value: "q4", label: "Q4 (Oct–Dec)" },
];

function filterByRange(expenses: Expense[], range: string): Expense[] {
  if (range === "all") return expenses;
  const now = new Date();
  const year = now.getFullYear();
  let start: Date;
  let end: Date = now;

  switch (range) {
    case "7d": start = new Date(now.getTime() - 7 * 86400000); break;
    case "30d": start = new Date(now.getTime() - 30 * 86400000); break;
    case "90d": start = new Date(now.getTime() - 90 * 86400000); break;
    case "ytd": start = new Date(year, 0, 1); break;
    case "q1": start = new Date(year, 0, 1); end = new Date(year, 2, 31); break;
    case "q2": start = new Date(year, 3, 1); end = new Date(year, 5, 30); break;
    case "q3": start = new Date(year, 6, 1); end = new Date(year, 8, 30); break;
    case "q4": start = new Date(year, 9, 1); end = new Date(year, 11, 31); break;
    default: return expenses;
  }

  return expenses.filter((e) => {
    const d = new Date(e.date);
    return d >= start && d <= end;
  });
}

// Custom active shape for highlighting selected slice
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 10} textAnchor="middle" fill="hsl(var(--foreground))" className="text-sm font-semibold">
        {payload.name}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="hsl(var(--muted-foreground))" className="text-xs">
        {formatCurrency(value)} ({(percent * 100).toFixed(1)}%)
      </text>
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius - 4}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius - 4}
        outerRadius={innerRadius - 1}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

export default function ExpenseBreakdownDialog({ open, onOpenChange, allExpenses }: Props) {
  const [range, setRange] = useState("all");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const filtered = useMemo(() => filterByRange(allExpenses, range), [allExpenses, range]);

  const categoryMap: Record<string, number> = {};
  filtered.forEach((e) => {
    categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
  });

  const pieData = useMemo(
    () =>
      Object.entries(categoryMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    [categoryMap]
  );

  const total = pieData.reduce((s, d) => s + d.value, 0);

  // Get transactions for selected category
  const selectedCategory = activeIndex !== null ? pieData[activeIndex]?.name : null;
  const categoryTransactions = useMemo(() => {
    if (!selectedCategory) return [];
    return filtered
      .filter((e) => e.category === selectedCategory)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered, selectedCategory]);

  const handlePieClick = (_: any, index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle className="text-xl">Expense Breakdown</DialogTitle>
            <div className="flex items-center gap-2">
              <Select value={range} onValueChange={(v) => { setRange(v); setActiveIndex(null); }}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(total)} across {filtered.length} transactions • Click a slice to drill down
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie chart */}
            <div>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    activeIndex={activeIndex ?? undefined}
                    activeShape={renderActiveShape}
                    onClick={handlePieClick}
                    className="cursor-pointer"
                  >
                    {pieData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        opacity={activeIndex !== null && activeIndex !== i ? 0.3 : 1}
                        stroke={activeIndex === i ? "hsl(var(--foreground))" : "transparent"}
                        strokeWidth={activeIndex === i ? 2 : 0}
                      />
                    ))}
                  </Pie>
                  {activeIndex === null && (
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={TOOLTIP_STYLE}
                    />
                  )}
                </PieChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 px-2">
                {pieData.map((item, i) => (
                  <button
                    key={item.name}
                    onClick={() => setActiveIndex(activeIndex === i ? null : i)}
                    className={`flex items-center justify-between text-sm py-1 px-2 rounded-md transition-all hover:bg-accent ${
                      activeIndex === i ? "bg-accent ring-1 ring-primary" : ""
                    } ${activeIndex !== null && activeIndex !== i ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="text-muted-foreground truncate text-xs">{item.name}</span>
                    </div>
                    <span className="font-mono text-xs shrink-0 ml-1">{formatCurrency(item.value)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Transactions panel */}
            <div className="min-h-[200px]">
              {selectedCategory ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActiveIndex(null)}>
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <div>
                        <h3 className="font-semibold text-sm">{selectedCategory}</h3>
                        <p className="text-xs text-muted-foreground">
                          {categoryTransactions.length} transactions • {formatCurrency(pieData[activeIndex!]?.value ?? 0)}
                          <span className="ml-1">
                            ({((pieData[activeIndex!]?.value ?? 0) / total * 100).toFixed(1)}%)
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-[440px] space-y-1">
                    {categoryTransactions.map((e) => (
                      <div key={e.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent/50 transition-colors text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{e.vendor}</p>
                          {e.description && (
                            <p className="text-xs text-muted-foreground truncate">{e.description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-mono text-sm">{formatCurrency(e.amount)}</p>
                          <p className="font-mono text-xs text-muted-foreground">{e.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4">
                    <span className="text-2xl">📊</span>
                  </div>
                  <h3 className="font-semibold mb-1">Select a Category</h3>
                  <p className="text-sm text-muted-foreground max-w-[220px]">
                    Click a slice on the chart or a category in the legend to see its transactions
                  </p>

                  {/* Top categories summary */}
                  <div className="mt-6 w-full space-y-2">
                    {pieData.slice(0, 5).map((item, i) => (
                      <button
                        key={item.name}
                        onClick={() => setActiveIndex(i)}
                        className="flex items-center justify-between w-full px-4 py-2 rounded-lg hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          <span className="text-sm">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-sm">{formatCurrency(item.value)}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {((item.value / total) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
