import { useState, useEffect, useRef } from "react";
import PersonalDashboardLayout from "@/components/PersonalDashboardLayout";
import { useW2Income, usePersonalDeductions } from "@/hooks/usePersonalData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/format";
import {
  calculateWithholdings,
  FILING_STATUS_LABELS,
  STANDARD_DEDUCTION,
  type FilingStatus,
} from "@/lib/taxCalc";
import { Button } from "@/components/ui/button";
import { Printer, FileText } from "lucide-react";

export default function Personal1040Page() {
  const { user } = useAuth();
  const { data: w2s = [] } = useW2Income();
  const { data: deductions = [] } = usePersonalDeductions();
  const printRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState({
    first_name: "",
    last_name: "",
    personal_address: "",
    personal_city: "",
    personal_state: "",
    personal_zip: "",
    ssn_last4: "",
    filing_status: "single" as FilingStatus,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("first_name, last_name, personal_address, personal_city, personal_state, personal_zip, ssn_last4, filing_status")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setProfile({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          personal_address: data.personal_address || "",
          personal_city: data.personal_city || "",
          personal_state: data.personal_state || "",
          personal_zip: data.personal_zip || "",
          ssn_last4: data.ssn_last4 || "",
          filing_status: data.filing_status || "single",
        });
      }
    })();
  }, [user]);

  const totalWages = w2s.reduce((s, w) => s + w.wages, 0);
  const totalFedWithheld = w2s.reduce((s, w) => s + w.federal_tax_withheld, 0);
  const totalStateWithheld = w2s.reduce((s, w) => s + w.state_tax_withheld, 0);
  const totalSSWithheld = w2s.reduce((s, w) => s + w.social_security_withheld, 0);
  const totalMedWithheld = w2s.reduce((s, w) => s + w.medicare_withheld, 0);

  const itemizedTotal = deductions.reduce((s, d) => s + d.amount, 0);
  const stdDeduction = STANDARD_DEDUCTION[profile.filing_status];
  const usingItemized = itemizedTotal > stdDeduction;
  const bestDeduction = Math.max(itemizedTotal, stdDeduction);
  const taxableIncome = Math.max(0, totalWages - bestDeduction);

  const estimated = calculateWithholdings(totalWages, profile.personal_state || "CA", profile.filing_status);
  let fedTax = estimated.federalWithholding;
  if (usingItemized) {
    const extra = itemizedTotal - stdDeduction;
    fedTax = Math.max(0, fedTax - extra * 0.22);
  }

  const totalTax = Math.round(fedTax * 100) / 100;
  const totalPayments = totalFedWithheld;
  const amountOwed = Math.max(0, totalTax - totalPayments);
  const refund = Math.max(0, totalPayments - totalTax);

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Form 1040 Preview - Tax Year 2026</title>
      <style>
        body { font-family: 'Courier New', monospace; max-width: 800px; margin: 40px auto; padding: 0 20px; font-size: 13px; color: #111; }
        h1 { text-align: center; font-size: 18px; border-bottom: 3px double #000; padding-bottom: 8px; }
        h2 { font-size: 14px; border-bottom: 1px solid #666; margin-top: 24px; }
        .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #ccc; }
        .row.bold { font-weight: bold; border-bottom: 2px solid #333; }
        .header-info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 16px 0; }
        .disclaimer { margin-top: 32px; padding: 12px; border: 1px solid #999; font-size: 11px; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  // 1040 line items (simplified)
  const lines: { line: string; label: string; value: number | string; bold?: boolean }[] = [
    { line: "1a", label: "Wages, salaries, tips (W-2, Box 1)", value: totalWages },
    { line: "9", label: "Total income", value: totalWages, bold: true },
    { line: "12", label: usingItemized ? "Itemized deductions (Schedule A)" : "Standard deduction", value: bestDeduction },
    { line: "15", label: "Taxable income", value: taxableIncome, bold: true },
    { line: "16", label: "Tax", value: totalTax },
    { line: "24", label: "Total tax", value: totalTax, bold: true },
    { line: "25a", label: "Federal income tax withheld (W-2s)", value: totalFedWithheld },
    { line: "33", label: "Total payments", value: totalPayments, bold: true },
  ];

  if (refund > 0) {
    lines.push({ line: "35a", label: "Overpaid / Refund", value: refund, bold: true });
  }
  if (amountOwed > 0) {
    lines.push({ line: "37", label: "Amount you owe", value: amountOwed, bold: true });
  }

  return (
    <PersonalDashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">1040 Preview</h1>
            <p className="text-muted-foreground text-sm mt-1">Simplified Form 1040 based on your data</p>
          </div>
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>

        <div className="stat-card" ref={printRef}>
          <h1 style={{ textAlign: "center", fontSize: "18px", borderBottom: "3px double hsl(var(--border))", paddingBottom: "8px", fontFamily: "monospace" }}>
            Form 1040 — U.S. Individual Income Tax Return (2026 Preview)
          </h1>
          <p style={{ textAlign: "center", fontSize: "11px", color: "hsl(var(--muted-foreground))" }}>
            Department of the Treasury — Internal Revenue Service
          </p>

          <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-4 mb-6 text-sm">
            <div className="flex gap-2"><span className="text-muted-foreground">Name:</span><span className="font-medium">{profile.first_name} {profile.last_name || "—"}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground">SSN:</span><span className="font-mono">XXX-XX-{profile.ssn_last4 || "XXXX"}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground">Address:</span><span>{profile.personal_address || "—"}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground">Filing Status:</span><span>{FILING_STATUS_LABELS[profile.filing_status]}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground">City/State/ZIP:</span><span>{[profile.personal_city, profile.personal_state, profile.personal_zip].filter(Boolean).join(", ") || "—"}</span></div>
          </div>

          <div className="space-y-1">
            {lines.map((l) => (
              <div
                key={l.line}
                className={`flex items-center justify-between text-sm py-1 ${l.bold ? "font-semibold border-t border-border pt-2" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground w-8 text-right font-mono text-xs">{l.line}</span>
                  <span>{l.label}</span>
                </div>
                <span className="font-mono">{typeof l.value === "number" ? formatCurrency(l.value) : l.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 p-3 rounded bg-muted text-xs text-muted-foreground">
            <strong>DRAFT — NOT FOR FILING.</strong> This is a simplified preview for planning purposes only. It does not include all 1040 lines, schedules, or credits. Consult a tax professional before filing.
          </div>
        </div>
      </div>
    </PersonalDashboardLayout>
  );
}
