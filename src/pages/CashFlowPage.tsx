import { useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import { useExpenses, useSales } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, Activity, Wallet } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function CashFlowPage() {
  const { data: expenses = [] } = useExpenses();
  const { data: sales = [] } = useSales();

  const { chartData, totalInflows, totalOutflows } = useMemo(() => {
    const monthMap: Record<string, { inflows: number; outflows: number }> = {};

    for (const s of sales) {
      const m = s.date.slice(0, 7); // YYYY-MM
      if (!monthMap[m]) monthMap[m] = { inflows: 0, outflows: 0 };
      monthMap[m].inflows += s.amount;
    }
    for (const e of expenses) {
      const m = e.date.slice(0, 7);
      if (!monthMap[m]) monthMap[m] = { inflows: 0, outflows: 0 };
      monthMap[m].outflows += e.amount;
    }

    const sorted = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    let balance = 0;
    const data = sorted.map((row) => {
      balance += row.inflows - row.outflows;
      return { ...row, balance };
    });

    const totalIn = data.reduce((s, r) => s + r.inflows, 0);
    const totalOut = data.reduce((s, r) => s + r.outflows, 0);

    return { chartData: data, totalInflows: totalIn, totalOutflows: totalOut };
  }, [expenses, sales]);

  const netCashFlow = totalInflows - totalOutflows;
  const currentBalance = chartData.length > 0 ? chartData[chartData.length - 1].balance : 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cash Flow Statement</h1>
          <p className="text-muted-foreground text-sm mt-1">Monthly inflows vs outflows with running balance</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Inflows" value={totalInflows} icon={ArrowUpRight} variant="positive" />
          <StatCard title="Total Outflows" value={totalOutflows} icon={ArrowDownLeft} variant="negative" />
          <StatCard title="Net Cash Flow" value={netCashFlow} icon={Activity} variant={netCashFlow >= 0 ? "positive" : "negative"} />
          <StatCard title="Current Balance" value={currentBalance} icon={Wallet} variant={currentBalance >= 0 ? "positive" : "negative"} />
        </div>

        {chartData.length > 0 && (
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-medium mb-4">Monthly Cash Flow</h2>
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="inflows" name="Inflows" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflows" name="Outflows" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="balance" name="Running Balance" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartData.length > 0 && (
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-medium mb-4">Monthly Breakdown</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Inflows</TableHead>
                  <TableHead className="text-right">Outflows</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right text-chart-positive">{formatCurrency(row.inflows)}</TableCell>
                    <TableCell className="text-right text-chart-negative">{formatCurrency(row.outflows)}</TableCell>
                    <TableCell className={`text-right ${row.inflows - row.outflows >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>
                      {formatCurrency(row.inflows - row.outflows)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(row.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {chartData.length === 0 && (
          <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
            No transaction data yet. Import sales and expenses to see your cash flow.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
