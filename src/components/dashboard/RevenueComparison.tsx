import { useMemo } from "react";
import { useSales } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_STYLE } from "@/lib/chartTheme";

export default function RevenueComparison() {
  const { data: allSales = [] } = useSales();

  const { currentRevenue, previousRevenue, pctChange, chartData } = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    const prevDate = new Date(curYear, curMonth - 1, 1);
    const prevMonth = prevDate.getMonth();
    const prevYear = prevDate.getFullYear();

    let current = 0;
    let previous = 0;

    allSales.forEach((s) => {
      const d = new Date(s.date);
      const m = d.getMonth();
      const y = d.getFullYear();
      if (m === curMonth && y === curYear) current += s.amount;
      if (m === prevMonth && y === prevYear) previous += s.amount;
    });

    const pct = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;

    // Build last 6 months for mini chart
    const months: { label: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(curYear, curMonth - i, 1);
      const mKey = d.getMonth();
      const yKey = d.getFullYear();
      const rev = allSales
        .filter((s) => {
          const sd = new Date(s.date);
          return sd.getMonth() === mKey && sd.getFullYear() === yKey;
        })
        .reduce((sum, s) => sum + s.amount, 0);
      months.push({
        label: d.toLocaleDateString("en-US", { month: "short" }),
        revenue: rev,
      });
    }

    return { currentRevenue: current, previousRevenue: previous, pctChange: pct, chartData: months };
  }, [allSales]);

  const isUp = pctChange > 0;
  const isDown = pctChange < 0;
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <div className="stat-card">
      <h2 className="section-title mb-1 flex items-center gap-2">
        <TrendIcon className="h-4 w-4 text-muted-foreground" />
        Revenue vs Last Month
      </h2>

      <div className="flex items-end gap-3 mb-4">
        <p className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-foreground">
          {formatCurrency(currentRevenue)}
        </p>
        <span
          className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
            isUp
              ? "bg-chart-positive/15 text-chart-positive"
              : isDown
              ? "bg-chart-negative/15 text-chart-negative"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isUp ? "+" : ""}
          {pctChange.toFixed(1)}%
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        <span>
          Last month: <span className="font-mono font-medium text-foreground">{formatCurrency(previousRevenue)}</span>
        </span>
        <span>
          Diff:{" "}
          <span className={`font-mono font-medium ${isUp ? "text-chart-positive" : isDown ? "text-chart-negative" : "text-foreground"}`}>
            {isUp ? "+" : ""}
            {formatCurrency(currentRevenue - previousRevenue)}
          </span>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={chartData} barCategoryGap="25%">
          <XAxis dataKey="label" {...AXIS_STYLE} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={i === chartData.length - 1 ? CHART_COLORS[0] : "hsl(var(--muted))"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
