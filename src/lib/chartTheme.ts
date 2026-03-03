/**
 * Shared chart theme constants — single source of truth for all Recharts styling.
 * Uses CSS custom properties so charts automatically adapt to dark mode.
 */

export const CHART_COLORS = [
  "hsl(var(--chart-positive))",
  "hsl(var(--chart-info))",
  "hsl(var(--chart-warning))",
  "hsl(var(--chart-negative))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
];

export const AXIS_STYLE = {
  stroke: "hsl(var(--border))",
  tick: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
} as const;

export const GRID_STYLE = {
  strokeDasharray: "3 3",
  stroke: "hsl(var(--border))",
} as const;

export const TOOLTIP_STYLE = {
  borderRadius: "8px",
  border: "1px solid hsl(var(--border))",
  fontSize: "13px",
  backgroundColor: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
} as const;

/** 8 distinct line/series colors for multi-line charts */
export const LINE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-positive))",
  "hsl(var(--chart-info))",
  "hsl(var(--chart-warning))",
  "hsl(var(--chart-negative))",
];
