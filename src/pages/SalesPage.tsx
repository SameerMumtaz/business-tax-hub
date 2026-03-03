import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSales, useAddSale, useRemoveSale, useExpenses } from "@/hooks/useData";
import { formatCurrency } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import StatCard from "@/components/StatCard";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight, Activity, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function SalesPage() {
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const addSale = useAddSale();
  const removeSale = useRemoveSale();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: "", client: "", description: "", amount: "", invoiceNumber: "" });

  const totalSales = sales.reduce((sum, s) => sum + s.amount, 0);

  const handleAdd = () => {
    if (!form.date || !form.client || !form.amount) {
      toast.error("Please fill required fields");
      return;
    }
    addSale.mutate({
      date: form.date, client: form.client, description: form.description,
      amount: parseFloat(form.amount),
      invoiceNumber: form.invoiceNumber || `INV-${Date.now().toString().slice(-4)}`,
    }, {
      onSuccess: () => { setForm({ date: "", client: "", description: "", amount: "", invoiceNumber: "" }); setOpen(false); toast.success("Sale added"); },
      onError: () => toast.error("Failed to add sale"),
    });
  };

  /* ── Cash Flow data ── */
  const { chartData, totalInflows, totalOutflows } = useMemo(() => {
    const monthMap: Record<string, { inflows: number; outflows: number }> = {};
    for (const s of sales) { const m = s.date.slice(0, 7); if (!monthMap[m]) monthMap[m] = { inflows: 0, outflows: 0 }; monthMap[m].inflows += s.amount; }
    for (const e of expenses) { const m = e.date.slice(0, 7); if (!monthMap[m]) monthMap[m] = { inflows: 0, outflows: 0 }; monthMap[m].outflows += e.amount; }
    const sorted = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
    let balance = 0;
    const data = sorted.map((row) => { balance += row.inflows - row.outflows; return { ...row, balance }; });
    return { chartData: data, totalInflows: data.reduce((s, r) => s + r.inflows, 0), totalOutflows: data.reduce((s, r) => s + r.outflows, 0) };
  }, [expenses, sales]);

  const netCashFlow = totalInflows - totalOutflows;
  const currentBalance = chartData.length > 0 ? chartData[chartData.length - 1].balance : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Total: <span className="font-mono text-chart-positive">{formatCurrency(totalSales)}</span>
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Sale</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Sale</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <Input placeholder="Client name" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                <Input placeholder="Invoice # (optional)" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
                <Button onClick={handleAdd} className="w-full" disabled={addSale.isPending}>Add Sale</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-4">
            <div className="stat-card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Invoice</th><th>Client</th><th>Description</th><th className="text-right">Amount</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono text-xs text-muted-foreground">{s.date}</td>
                      <td className="font-mono text-xs">{s.invoiceNumber}</td>
                      <td className="font-medium">{s.client}</td>
                      <td className="text-muted-foreground">{s.description}</td>
                      <td className="text-right font-mono text-chart-positive">{formatCurrency(s.amount)}</td>
                      <td>
                        <Button variant="ghost" size="icon" onClick={() => { removeSale.mutate(s.id); toast.success("Removed"); }}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="cashflow" className="space-y-8 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total Inflows" value={totalInflows} icon={ArrowUpRight} variant="positive" />
              <StatCard title="Total Outflows" value={totalOutflows} icon={ArrowDownLeft} variant="negative" />
              <StatCard title="Net Cash Flow" value={netCashFlow} icon={Activity} variant={netCashFlow >= 0 ? "positive" : "negative"} />
              <StatCard title="Current Balance" value={currentBalance} icon={Wallet} variant={currentBalance >= 0 ? "positive" : "negative"} />
            </div>

            {chartData.length > 0 ? (
              <>
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
              </>
            ) : (
              <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
                No transaction data yet. Import sales and expenses to see your cash flow.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
