import { useMemo } from "react";
import { useInvoices } from "@/hooks/useInvoices";
import { formatCurrency } from "@/lib/format";
import { CHART_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE } from "@/lib/chartTheme";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";

const BUCKETS = [
  { label: "Current", min: -Infinity, max: 0, color: CHART_COLORS[0] },
  { label: "1-30 days", min: 1, max: 30, color: CHART_COLORS[1] },
  { label: "31-60 days", min: 31, max: 60, color: CHART_COLORS[2] },
  { label: "61-90 days", min: 61, max: 90, color: CHART_COLORS[3] },
  { label: "90+ days", min: 91, max: Infinity, color: CHART_COLORS[4] || CHART_COLORS[3] },
];

export default function InvoiceAgingChart() {
  const { data: invoices = [] } = useInvoices();

  const agingData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unpaid = invoices.filter(
      (i) => i.pay_status !== "paid" && i.status !== "paid" && i.status !== "draft"
    );

    return BUCKETS.map((bucket) => {
      const total = unpaid.reduce((sum, inv) => {
        const due = inv.due_date ? new Date(inv.due_date) : new Date(inv.issue_date);
        const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue >= bucket.min && daysOverdue <= bucket.max) return sum + inv.total;
        return sum;
      }, 0);
      return { name: bucket.label, amount: total, color: bucket.color };
    });
  }, [invoices]);

  const totalOutstanding = agingData.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="section-title flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Invoice Aging
        </h2>
        <Link to="/aging-report" className="text-xs text-primary hover:underline">
          Details
        </Link>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {formatCurrency(totalOutstanding)} outstanding
      </p>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={agingData} barCategoryGap="20%">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="name" {...AXIS_STYLE} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis {...AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={45} />
          <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {agingData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {agingData.filter((d) => d.amount > 0).map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground">{d.name}:</span>
            <span className="font-mono font-medium">{formatCurrency(d.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
