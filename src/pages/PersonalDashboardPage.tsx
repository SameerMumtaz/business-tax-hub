import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { useW2Income, usePersonalExpenses, usePersonalDeductions } from "@/hooks/usePersonalData";
import { formatCurrency } from "@/lib/format";
import { Wallet, TrendingDown, Receipt, Calculator } from "lucide-react";
import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "hsl(160, 84%, 39%)",
  "hsl(217, 91%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(280, 65%, 60%)",
  "hsl(200, 70%, 50%)",
  "hsl(340, 75%, 55%)",
  "hsl(160, 40%, 55%)",
];

const STANDARD_DEDUCTION = 15700;

export default function PersonalDashboardPage() {
  const { data: w2s = [] } = useW2Income();
  const { data: expenses = [] } = usePersonalExpenses();
  const { data: deductions = [] } = usePersonalDeductions();

  const totalIncome = w2s.reduce((s, w) => s + w.wages, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const deductibleExpenses = expenses.filter((e) => e.tax_deductible).reduce((s, e) => s + e.amount, 0);
  const itemizedTotal = deductions.reduce((s, d) => s + d.amount, 0);
  const bestDeduction = Math.max(itemizedTotal, STANDARD_DEDUCTION);
  const taxableIncome = Math.max(0, totalIncome - bestDeduction);

  const totalWithheld = w2s.reduce((s, w) => s + w.federal_tax_withheld, 0);

  // Simple federal estimate (2026 single brackets)
  const estFederalTax = useMemo(() => {
    const brackets = [
      { limit: 11925, rate: 0.10 },
      { limit: 48475, rate: 0.12 },
      { limit: 103350, rate: 0.22 },
      { limit: 197300, rate: 0.24 },
      { limit: 250525, rate: 0.32 },
      { limit: 626350, rate: 0.35 },
      { limit: Infinity, rate: 0.37 },
    ];
    let remaining = taxableIncome;
    let tax = 0;
    let prev = 0;
    for (const b of brackets) {
      const span = Math.min(remaining, b.limit - prev);
      if (span <= 0) break;
      tax += span * b.rate;
      remaining -= span;
      prev = b.limit;
    }
    return tax;
  }, [taxableIncome]);

  const estOwed = Math.max(0, estFederalTax - totalWithheld);

  // Expense category pie
  const categoryMap: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
  });
  const pieData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

  const cards = [
    { title: "Total Income", value: totalIncome, icon: Wallet, sub: `${w2s.length} W-2 form${w2s.length !== 1 ? "s" : ""}` },
    { title: "Total Expenses", value: totalExpenses, icon: TrendingDown, sub: `${expenses.length} transactions` },
    { title: "Best Deduction", value: bestDeduction, icon: Receipt, sub: itemizedTotal > STANDARD_DEDUCTION ? "Itemized" : "Standard" },
    { title: "Est. Tax Owed", value: estOwed, icon: Calculator, sub: `After ${formatCurrency(totalWithheld)} withheld` },
  ];

  return (
    <PersonalDashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personal Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Your personal finances at a glance</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div key={c.title} className="stat-card py-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                  <c.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">{c.title}</p>
              </div>
              <p className="text-2xl font-bold font-mono">{formatCurrency(c.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="stat-card">
            <h2 className="section-title mb-4">Spending by Category</h2>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No expenses recorded yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: "8px", fontSize: "13px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {pieData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground truncate max-w-[120px]">{item.name}</span>
                      </div>
                      <span className="font-mono text-xs">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="stat-card">
            <h2 className="section-title mb-4">Tax Summary</h2>
            <div className="space-y-3">
              {[
                { label: "Gross Income", val: totalIncome },
                { label: "Deductions", val: -bestDeduction },
                { label: "Taxable Income", val: taxableIncome },
                { label: "Est. Federal Tax", val: estFederalTax },
                { label: "Already Withheld", val: -totalWithheld },
                { label: "Est. Remaining Owed", val: estOwed },
              ].map((row) => (
                <div key={row.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className={`font-mono ${row.val < 0 ? "text-chart-positive" : ""}`}>
                    {row.val < 0 ? "−" : ""}{formatCurrency(Math.abs(row.val))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PersonalDashboardLayout>
  );
}
