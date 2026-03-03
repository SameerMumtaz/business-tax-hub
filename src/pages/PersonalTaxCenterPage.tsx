import { useState, useEffect, useMemo } from "react";
import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { useW2Income, usePersonalDeductions } from "@/hooks/usePersonalData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/format";
import {
  calculateWithholdings,
  FILING_STATUS_LABELS,
  STATE_RATES,
  STANDARD_DEDUCTION,
  type FilingStatus,
} from "@/lib/taxCalc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingUp, FileText, AlertTriangle } from "lucide-react";

// Use the STANDARD_DEDUCTION from taxCalc keyed by FilingStatus
// taxCalc exports it as Record<FilingStatus, number>

export default function PersonalTaxCenterPage() {
  const { user } = useAuth();
  const { data: w2s = [] } = useW2Income();
  const { data: deductions = [] } = usePersonalDeductions();

  const [filingStatus, setFilingStatus] = useState<FilingStatus>("single");
  const [homeState, setHomeState] = useState("CA");

  // Load user's filing status and state from profile
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("filing_status, personal_state")
        .eq("user_id", user.id)
        .single();
      if (data) {
        if (data.filing_status) setFilingStatus(data.filing_status);
        if (data.personal_state) setHomeState(data.personal_state);
      }
    })();
  }, [user]);

  const totalWages = w2s.reduce((s, w) => s + w.wages, 0);
  const totalFedWithheld = w2s.reduce((s, w) => s + w.federal_tax_withheld, 0);
  const totalStateWithheld = w2s.reduce((s, w) => s + w.state_tax_withheld, 0);
  const totalSSWithheld = w2s.reduce((s, w) => s + w.social_security_withheld, 0);
  const totalMedWithheld = w2s.reduce((s, w) => s + w.medicare_withheld, 0);

  const itemizedTotal = deductions.reduce((s, d) => s + d.amount, 0);
  const stdDeduction = STANDARD_DEDUCTION[filingStatus];
  const bestDeduction = Math.max(itemizedTotal, stdDeduction);
  const usingItemized = itemizedTotal > stdDeduction;

  // Calculate estimated tax using taxCalc
  const estimated = useMemo(() => {
    const result = calculateWithholdings(totalWages, homeState, filingStatus);
    // Adjust federal for deductions (recalculate with taxable income)
    // The calculateWithholdings uses standard deduction internally, so we use it directly
    // but if itemized is better, we need to adjust
    // For simplicity, we use the calcFederalWithholding path which already applies standard deduction
    // If itemized > standard, the difference saves additional tax at marginal rate
    let fedTax = result.federalWithholding;
    if (usingItemized) {
      const extraDeduction = itemizedTotal - stdDeduction;
      // Approximate savings at ~22% marginal rate
      fedTax = Math.max(0, fedTax - extraDeduction * 0.22);
    }
    return {
      federal: Math.round(fedTax * 100) / 100,
      state: result.stateWithholding,
      socialSecurity: result.socialSecurity,
      medicare: result.medicare,
    };
  }, [totalWages, homeState, filingStatus, usingItemized, itemizedTotal, stdDeduction]);

  const totalEstimatedTax = estimated.federal + estimated.state;
  const totalWithheld = totalFedWithheld + totalStateWithheld;
  const netOwed = totalEstimatedTax - totalWithheld;

  const stateRate = STATE_RATES[homeState] ?? 0;

  const rows = [
    { label: "Gross Wages (W-2)", value: totalWages },
    { label: `Deduction (${usingItemized ? "Itemized" : "Standard"})`, value: -bestDeduction },
    { label: "Taxable Income", value: Math.max(0, totalWages - bestDeduction), bold: true },
    { label: "divider" },
    { label: "Est. Federal Income Tax", value: estimated.federal },
    { label: `Est. State Tax (${homeState} @ ${(stateRate * 100).toFixed(1)}%)`, value: estimated.state },
    { label: "Est. Social Security", value: estimated.socialSecurity },
    { label: "Est. Medicare", value: estimated.medicare },
    { label: "divider" },
    { label: "Total Estimated Tax", value: totalEstimatedTax, bold: true },
    { label: "Federal Withheld (W-2s)", value: -totalFedWithheld },
    { label: "State Withheld (W-2s)", value: -totalStateWithheld },
    { label: "divider" },
    { label: netOwed > 0 ? "Estimated Amount Owed" : "Estimated Refund", value: Math.abs(netOwed), bold: true, refund: netOwed <= 0 },
  ];

  return (
    <PersonalDashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tax Center</h1>
            <p className="text-muted-foreground text-sm mt-1">Estimate your 2026 federal &amp; state tax liability</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filingStatus} onValueChange={(v) => setFilingStatus(v as FilingStatus)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(FILING_STATUS_LABELS) as [FilingStatus, string][]).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={homeState} onValueChange={setHomeState}>
              <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(STATE_RATES).sort().map((st) => (
                  <SelectItem key={st} value={st}>{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="estimate">
          <TabsList>
            <TabsTrigger value="estimate" className="gap-1.5"><Calculator className="h-4 w-4" /> Tax Estimate</TabsTrigger>
            <TabsTrigger value="withholdings" className="gap-1.5"><TrendingUp className="h-4 w-4" /> Withholdings</TabsTrigger>
            <TabsTrigger value="summary" className="gap-1.5"><FileText className="h-4 w-4" /> Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="estimate" className="mt-6 space-y-4">
            {/* Net result card */}
            <div className={`stat-card text-center py-8 ${netOwed > 0 ? "ring-2 ring-destructive/40" : "ring-2 ring-chart-positive/40"}`}>
              <p className="text-sm text-muted-foreground">{netOwed > 0 ? "Estimated Amount Owed" : "Estimated Refund"}</p>
              <p className={`text-4xl font-bold font-mono mt-2 ${netOwed > 0 ? "text-destructive" : "text-chart-positive"}`}>
                {netOwed > 0 ? "" : "+"}{formatCurrency(Math.abs(netOwed))}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Based on {w2s.length} W-2{w2s.length !== 1 ? "s" : ""} and {deductions.length} deduction{deductions.length !== 1 ? "s" : ""}</p>
            </div>

            {/* Breakdown */}
            <div className="stat-card">
              <h2 className="section-title mb-4">Tax Calculation Breakdown</h2>
              <div className="space-y-2">
                {rows.map((row, i) => {
                  if (row.label === "divider") return <div key={i} className="border-t border-border my-2" />;
                  return (
                    <div key={row.label} className={`flex justify-between text-sm py-0.5 ${row.bold ? "font-semibold" : ""}`}>
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className={`font-mono ${row.refund ? "text-chart-positive" : ""} ${row.value! < 0 ? "text-chart-positive" : ""}`}>
                        {row.value! < 0 ? "−" : ""}{formatCurrency(Math.abs(row.value!))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="withholdings" className="mt-6 space-y-4">
            <div className="stat-card">
              <h2 className="section-title mb-4">W-2 Withholdings Summary</h2>
              {w2s.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No W-2 forms entered. Add income on the Income page.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employer</th>
                        <th className="text-right">Wages</th>
                        <th className="text-right">Federal</th>
                        <th className="text-right">State</th>
                        <th className="text-right">SS</th>
                        <th className="text-right">Medicare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {w2s.map((w) => (
                        <tr key={w.id}>
                          <td className="font-medium">{w.employer_name}</td>
                          <td className="text-right font-mono">{formatCurrency(w.wages)}</td>
                          <td className="text-right font-mono">{formatCurrency(w.federal_tax_withheld)}</td>
                          <td className="text-right font-mono">{formatCurrency(w.state_tax_withheld)}</td>
                          <td className="text-right font-mono">{formatCurrency(w.social_security_withheld)}</td>
                          <td className="text-right font-mono">{formatCurrency(w.medicare_withheld)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold border-t-2 border-border">
                        <td>Total</td>
                        <td className="text-right font-mono">{formatCurrency(totalWages)}</td>
                        <td className="text-right font-mono">{formatCurrency(totalFedWithheld)}</td>
                        <td className="text-right font-mono">{formatCurrency(totalStateWithheld)}</td>
                        <td className="text-right font-mono">{formatCurrency(totalSSWithheld)}</td>
                        <td className="text-right font-mono">{formatCurrency(totalMedWithheld)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="summary" className="mt-6 space-y-4">
            <div className="stat-card">
              <h2 className="section-title mb-4">Tax Year 2026 Summary</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Income</h3>
                  <div className="flex justify-between text-sm"><span>W-2 Wages</span><span className="font-mono">{formatCurrency(totalWages)}</span></div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Deductions</h3>
                  <div className="flex justify-between text-sm"><span>Standard</span><span className="font-mono">{formatCurrency(stdDeduction)}</span></div>
                  <div className="flex justify-between text-sm"><span>Itemized</span><span className="font-mono">{formatCurrency(itemizedTotal)}</span></div>
                  <div className="flex justify-between text-sm font-semibold"><span>Using</span><span>{usingItemized ? "Itemized" : "Standard"}</span></div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Withheld (YTD)</h3>
                  <div className="flex justify-between text-sm"><span>Federal</span><span className="font-mono">{formatCurrency(totalFedWithheld)}</span></div>
                  <div className="flex justify-between text-sm"><span>State</span><span className="font-mono">{formatCurrency(totalStateWithheld)}</span></div>
                  <div className="flex justify-between text-sm"><span>FICA</span><span className="font-mono">{formatCurrency(totalSSWithheld + totalMedWithheld)}</span></div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Result</h3>
                  <div className="flex justify-between text-sm font-semibold">
                    <span>{netOwed > 0 ? "You owe" : "Refund"}</span>
                    <span className={`font-mono ${netOwed > 0 ? "text-destructive" : "text-chart-positive"}`}>{formatCurrency(Math.abs(netOwed))}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 p-4 rounded-lg bg-muted text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>These estimates are for planning purposes only and may not reflect your actual tax liability. Consult a qualified tax professional for advice specific to your situation.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PersonalDashboardLayout>
  );
}
