import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { Wallet, TrendingDown, Receipt, Calculator } from "lucide-react";

export default function PersonalDashboardPage() {
  return (
    <PersonalDashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personal Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Track your personal finances and taxes</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: "Total Income", icon: Wallet, desc: "W-2 wages, freelance, and other income" },
            { title: "Total Expenses", icon: TrendingDown, desc: "Tax-deductible personal expenses" },
            { title: "Deductions", icon: Receipt, desc: "Standard or itemized deductions" },
            { title: "Est. Tax Owed", icon: Calculator, desc: "Federal and state estimates" },
          ].map((item) => (
            <div key={item.title} className="stat-card flex flex-col items-center text-center gap-3 py-8">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <item.icon className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
              <span className="text-2xl font-bold font-mono text-muted-foreground">—</span>
            </div>
          ))}
        </div>

        <div className="stat-card p-8 text-center space-y-3">
          <h2 className="section-title">Coming Soon</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            W-2 income entry, personal expense tracking, deductions calculator, and 1040 form preview are being built. Check back soon!
          </p>
        </div>
      </div>
    </PersonalDashboardLayout>
  );
}
