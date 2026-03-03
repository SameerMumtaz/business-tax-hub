import { useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useExpenses, useSales, useProfile } from "@/hooks/useData";
import { calculateWithholdings, STATE_RATES } from "@/lib/taxCalc";
import { formatCurrency } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calculator, Calendar, DollarSign, Landmark } from "lucide-react";

const SE_RATE = 0.153;
const SE_FACTOR = 0.9235;

const QUARTERLY_DATES = [
  { label: "Q1", due: "Apr 15, 2026" },
  { label: "Q2", due: "Jun 15, 2026" },
  { label: "Q3", due: "Sep 15, 2026" },
  { label: "Q4", due: "Jan 15, 2027" },
];

export default function TaxEstimatePage() {
  const { data: expenses = [] } = useExpenses();
  const { data: sales = [] } = useSales();
  const { data: profile } = useProfile();

  const state = profile?.business_state || "CA";

  const { netIncome, seTax, federalTax, stateTax, totalLiability } = useMemo(() => {
    const totalRevenue = sales.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
    const net = totalRevenue - totalExpenses;

    const seBase = Math.max(0, net * SE_FACTOR);
    const se = Math.round(seBase * SE_RATE * 100) / 100;

    // For federal/state, reduce taxable income by 50% of SE tax (deductible)
    const adjustedIncome = Math.max(0, net - se / 2);
    const w = calculateWithholdings(adjustedIncome, state);

    return {
      netIncome: net,
      seTax: se,
      federalTax: w.federalWithholding,
      stateTax: w.stateWithholding,
      totalLiability: w.federalWithholding + w.stateWithholding + se,
    };
  }, [expenses, sales, state]);

  const quarterlyPayment = Math.round((totalLiability / 4) * 100) / 100;

  // Year progress (based on current date in tax year 2026)
  const now = new Date();
  const yearStart = new Date(2026, 0, 1);
  const yearEnd = new Date(2026, 11, 31);
  const yearProgress = Math.min(100, Math.max(0, ((now.getTime() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime())) * 100));

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tax Liability Estimator</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Projected federal + state + self-employment tax — {state} filer
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Net Income</span>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className={`text-2xl font-semibold font-mono tracking-tight ${netIncome >= 0 ? "text-chart-positive" : "text-chart-negative"}`}>
              {formatCurrency(netIncome)}
            </p>
          </div>
          <div className="stat-card animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Federal Tax</span>
              <Landmark className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">{formatCurrency(federalTax)}</p>
          </div>
          <div className="stat-card animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">State Tax ({state})</span>
              <Landmark className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">{formatCurrency(stateTax)}</p>
          </div>
          <div className="stat-card animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">SE Tax (15.3%)</span>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">{formatCurrency(seTax)}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5" />
              Total Estimated Liability: {formatCurrency(totalLiability)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>Tax Year Progress</span>
                <span>{yearProgress.toFixed(0)}%</span>
              </div>
              <Progress value={yearProgress} />
            </div>
            <p className="text-sm text-muted-foreground">
              Accrued liability estimate: {formatCurrency(totalLiability * yearProgress / 100)} of {formatCurrency(totalLiability)}
            </p>
          </CardContent>
        </Card>

        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Quarterly Payment Schedule
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarter</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Estimated Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {QUARTERLY_DATES.map((q) => (
                <TableRow key={q.label}>
                  <TableCell className="font-medium">{q.label}</TableCell>
                  <TableCell>{q.due}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(quarterlyPayment)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          ⚠ These are estimates using simplified tax brackets and flat state rates. Consult a tax professional for accurate filing.
        </p>
      </div>
    </DashboardLayout>
  );
}
