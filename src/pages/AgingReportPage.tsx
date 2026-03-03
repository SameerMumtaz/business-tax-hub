import { useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useInvoices, Invoice } from "@/hooks/useInvoices";
import { useInvoicePayments } from "@/hooks/useInvoicePayments";
import { formatCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import ExportButton from "@/components/ExportButton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

const AGING_BUCKETS = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days"] as const;
const BUCKET_COLORS = [
  "hsl(var(--chart-positive))",
  "hsl(var(--chart-info))",
  "hsl(var(--chart-warning))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-negative))",
];

interface AgingEntry {
  invoice: Invoice;
  daysOverdue: number;
  bucket: typeof AGING_BUCKETS[number];
  amountDue: number;
  amountPaid: number;
}

function getBucket(days: number): typeof AGING_BUCKETS[number] {
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30 Days";
  if (days <= 60) return "31-60 Days";
  if (days <= 90) return "61-90 Days";
  return "90+ Days";
}

export default function AgingReportPage() {
  const { data: invoices = [] } = useInvoices();
  const { data: payments = [] } = useInvoicePayments();

  const agingData = useMemo(() => {
    const today = new Date();
    const unpaid = invoices.filter((inv) => inv.status !== "paid");

    return unpaid.map((inv): AgingEntry => {
      const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.issue_date);
      const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      const invoicePayments = payments.filter((p) => p.invoice_id === inv.id);
      const amountPaid = invoicePayments.reduce((s, p) => s + p.amount, 0);
      return {
        invoice: inv,
        daysOverdue,
        bucket: getBucket(daysOverdue),
        amountDue: inv.total - amountPaid,
        amountPaid,
      };
    }).filter((e) => e.amountDue > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [invoices, payments]);

  const bucketSummary = useMemo(() => {
    return AGING_BUCKETS.map((bucket) => {
      const entries = agingData.filter((e) => e.bucket === bucket);
      return {
        bucket,
        count: entries.length,
        total: entries.reduce((s, e) => s + e.amountDue, 0),
      };
    });
  }, [agingData]);

  const totalOutstanding = agingData.reduce((s, e) => s + e.amountDue, 0);

  const exportData = agingData.map((e) => ({
    invoice_number: e.invoice.invoice_number,
    client: e.invoice.client_name,
    issue_date: e.invoice.issue_date,
    due_date: e.invoice.due_date || "",
    total: e.invoice.total,
    paid: e.amountPaid,
    balance_due: e.amountDue,
    days_overdue: e.daysOverdue,
    aging_bucket: e.bucket,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Unpaid Invoices</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Invoices your clients haven't paid yet — {formatCurrency(totalOutstanding)} outstanding
            </p>
          </div>
          <ExportButton
            data={exportData}
            filename="ar-aging-report"
            columns={[
              { key: "invoice_number", label: "Invoice #" },
              { key: "client", label: "Client" },
              { key: "issue_date", label: "Issue Date" },
              { key: "due_date", label: "Due Date" },
              { key: "total", label: "Total" },
              { key: "paid", label: "Paid" },
              { key: "balance_due", label: "Balance Due" },
              { key: "days_overdue", label: "Days Overdue" },
              { key: "aging_bucket", label: "Bucket" },
            ]}
          />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {bucketSummary.map((b, i) => (
            <div key={b.bucket} className="stat-card">
              <p className="text-xs font-medium text-muted-foreground">{b.bucket}</p>
              <p className="text-lg font-semibold font-mono mt-1" style={{ color: BUCKET_COLORS[i] }}>
                {formatCurrency(b.total)}
              </p>
              <p className="text-xs text-muted-foreground">{b.count} invoice{b.count !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        {totalOutstanding > 0 && (
          <div className="stat-card">
            <h2 className="section-title mb-4">Aging Distribution</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bucketSummary}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {bucketSummary.map((_, i) => (
                    <Cell key={i} fill={BUCKET_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Detail table */}
        <div className="stat-card">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Outstanding Invoices
          </h2>
          {agingData.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="rounded-full bg-accent p-4">
                <CheckCircle2 className="h-8 w-8 text-chart-positive" />
              </div>
              <h3 className="font-semibold text-lg">All caught up!</h3>
              <p className="text-muted-foreground text-sm max-w-sm text-center">
                All your invoices have been paid. When clients owe you money, it'll show up here so you can follow up.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead>Aging</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agingData.map((e) => {
                  const bucketIdx = AGING_BUCKETS.indexOf(e.bucket);
                  return (
                    <TableRow key={e.invoice.id}>
                      <TableCell className="font-mono text-xs">{e.invoice.invoice_number}</TableCell>
                      <TableCell>{e.invoice.client_name}</TableCell>
                      <TableCell className="text-xs">{e.invoice.issue_date}</TableCell>
                      <TableCell className="text-xs">{e.invoice.due_date || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(e.invoice.total)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-chart-positive">{formatCurrency(e.amountPaid)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(e.amountDue)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={bucketIdx >= 3 ? "destructive" : bucketIdx >= 2 ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {e.daysOverdue > 0 && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {e.bucket}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
