import { useExpenses, useSales, useContractors, useProfile } from "@/hooks/useData";
import { useQuotes } from "@/hooks/useQuotes";
import { useInvoices } from "@/hooks/useInvoices";
import { useDateRange } from "@/contexts/DateRangeContext";
import { formatCurrency } from "@/lib/format";
import { CHART_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE } from "@/lib/chartTheme";
import StatCard from "@/components/StatCard";
import DashboardLayout from "@/components/DashboardLayout";
import DateRangeFilter from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";
import SmartAlerts from "@/components/SmartAlerts";
import OnboardingWizard from "@/components/OnboardingWizard";
import HelpTooltip from "@/components/HelpTooltip";
import ExpenseBreakdownDialog from "@/components/ExpenseBreakdownDialog";
import BookingRequestsPanel from "@/components/BookingRequestsPanel";
import ThisWeekJobs from "@/components/dashboard/ThisWeekJobs";
import InvoiceAgingChart from "@/components/dashboard/InvoiceAgingChart";
import RevenueComparison from "@/components/dashboard/RevenueComparison";
import { TrendingUp, TrendingDown, DollarSign, Users, Expand, ClipboardList, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useMemo, useState } from "react";

export default function DashboardPage() {
  const { data: allExpenses = [] } = useExpenses();
  const { data: allSales = [] } = useSales();
  const { data: contractors = [] } = useContractors();
  const { data: profile } = useProfile();
  const { filterByDate } = useDateRange();
  const { data: quotes = [] } = useQuotes();
  const { data: allInvoices = [] } = useInvoices();
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const expenses = useMemo(() => filterByDate(allExpenses), [allExpenses, filterByDate]);
  const sales = useMemo(() => filterByDate(allSales), [allSales, filterByDate]);

  const completedSteps = useMemo(() => {
    const steps = new Set<string>();
    if (profile?.business_name) steps.add("profile");
    if (allExpenses.length > 0 || allSales.length > 0) steps.add("import");
    const uncategorized = allExpenses.filter((e) => e.category === "Other" || !e.category);
    if (allExpenses.length > 0 && uncategorized.length < allExpenses.length * 0.5) steps.add("categorize");
    return steps;
  }, [profile, allExpenses, allSales]);

  const totalRevenue = sales.reduce((sum, s) => sum + s.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netIncome = totalRevenue - totalExpenses;

  const pendingQuotes = quotes.filter(q => q.status === "sent" || q.status === "draft");
  const pendingQuotesValue = pendingQuotes.reduce((s, q) => s + q.total, 0);

  const outstandingInvoices = allInvoices.filter(i => i.status !== "paid" && i.pay_status !== "paid" && i.status !== "draft");
  const outstandingBalance = outstandingInvoices.reduce((s, i) => s + i.total, 0);

  const categoryMap: Record<string, number> = {};
  expenses.forEach((e) => { categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount; });
  const pieData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

  const monthlyRevenue: Record<string, number> = {};
  sales.forEach((s) => { const month = s.date.substring(0, 7); monthlyRevenue[month] = (monthlyRevenue[month] || 0) + s.amount; });
  const barData = Object.entries(monthlyRevenue)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }), revenue }));

  const exportData = [
    ...sales.map((s) => ({ date: s.date, description: `${s.client} — ${s.description}`, type: "Income", amount: s.amount })),
    ...expenses.map((e) => ({ date: e.date, description: `${e.vendor} — ${e.description}`, type: "Expense", amount: -e.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Here's how your business is doing</p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter />
            <ExportButton data={exportData} filename="dashboard-transactions" columns={[{ key: "date", label: "Date" }, { key: "description", label: "Description" }, { key: "type", label: "Type" }, { key: "amount", label: "Amount" }]} />
          </div>
        </div>

        {showOnboarding && completedSteps.size < 3 && (
          <OnboardingWizard completedSteps={completedSteps} onDismiss={() => setShowOnboarding(false)} />
        )}

        <SmartAlerts />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <StatCard title="Total Revenue" value={totalRevenue} icon={TrendingUp} variant="positive" trend={`${sales.length} transactions`} />
          <StatCard title="Total Expenses" value={totalExpenses} icon={TrendingDown} variant="negative" trend={`${expenses.length} transactions`} />
          <StatCard title="Net Profit" value={netIncome} icon={DollarSign} variant={netIncome >= 0 ? "positive" : "negative"} />
          <StatCard title="Pending Quotes" value={pendingQuotesValue} icon={ClipboardList} trend={`${pendingQuotes.length} quotes`} />
          <Link to="/invoices" className="no-underline">
            <StatCard title="Collect Payment" value={outstandingBalance} icon={CreditCard} variant="negative" trend={`${outstandingInvoices.length} unpaid invoices`} />
          </Link>
          <StatCard title="Contractor Payments" value={contractors.reduce((s, c) => s + c.totalPaid, 0)} icon={Users} trend={`${contractors.length} contractors`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="stat-card">
            <h2 className="section-title mb-4">Monthly Revenue</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="month" {...AXIS_STYLE} />
                <YAxis {...AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="stat-card cursor-pointer group" onClick={() => setShowBreakdown(true)}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Expense Breakdown</h2>
              <Expand className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <ResponsiveContainer width="100%" height={200} className="sm:w-1/2">
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 w-full space-y-2">
                {pieData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-muted-foreground truncate max-w-[120px]">{item.name}</span>
                    </div>
                    <span className="font-mono text-xs">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ThisWeekJobs />
          <InvoiceAgingChart />
          <RevenueComparison />
        </div>

        <BookingRequestsPanel />

        <ExpenseBreakdownDialog open={showBreakdown} onOpenChange={setShowBreakdown} allExpenses={allExpenses} />
      </div>
    </DashboardLayout>
  );
}
