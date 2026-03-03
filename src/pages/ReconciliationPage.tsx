import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useExpenses, useSales } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, CheckCircle2, Clock, Trash2, Scale } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ReconciliationPeriod {
  id: string;
  account_name: string;
  period_start: string;
  period_end: string;
  statement_balance: number;
  reconciled_at: string | null;
  status: string;
  created_at: string;
}

function useReconciliationPeriods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["reconciliation_periods", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reconciliation_periods")
        .select("*")
        .eq("user_id", user!.id)
        .order("period_end", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        statement_balance: Number(r.statement_balance),
      })) as ReconciliationPeriod[];
    },
  });
}

export default function ReconciliationPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: periods = [] } = useReconciliationPeriods();
  const { data: expenses = [] } = useExpenses();
  const { data: sales = [] } = useSales();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ account_name: "", period_start: "", period_end: "", statement_balance: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedPeriod = periods.find((p) => p.id === selectedId);

  const computedBalance = useMemo(() => {
    if (!selectedPeriod) return null;
    const inRange = (date: string) => date >= selectedPeriod.period_start && date <= selectedPeriod.period_end;
    const salesSum = sales.filter((s) => inRange(s.date)).reduce((sum, s) => sum + s.amount, 0);
    const expensesSum = expenses.filter((e) => inRange(e.date)).reduce((sum, e) => sum + e.amount, 0);
    return { salesSum, expensesSum, net: salesSum - expensesSum, difference: selectedPeriod.statement_balance - (salesSum - expensesSum) };
  }, [selectedPeriod, sales, expenses]);

  const handleCreate = async () => {
    if (!form.account_name || !form.period_start || !form.period_end || !form.statement_balance) {
      toast.error("Please fill all fields"); return;
    }
    const { error } = await supabase.from("reconciliation_periods").insert({
      user_id: user!.id,
      account_name: form.account_name,
      period_start: form.period_start,
      period_end: form.period_end,
      statement_balance: parseFloat(form.statement_balance),
      status: "open",
    });
    if (error) { toast.error("Failed to create"); return; }
    qc.invalidateQueries({ queryKey: ["reconciliation_periods"] });
    toast.success("Reconciliation period created");
    setForm({ account_name: "", period_start: "", period_end: "", statement_balance: "" });
    setShowForm(false);
  };

  const handleReconcile = async (id: string) => {
    const { error } = await supabase.from("reconciliation_periods").update({
      status: "reconciled",
      reconciled_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error("Failed to reconcile"); return; }
    qc.invalidateQueries({ queryKey: ["reconciliation_periods"] });
    toast.success("Period marked as reconciled");
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("reconciliation_periods").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    if (selectedId === id) setSelectedId(null);
    qc.invalidateQueries({ queryKey: ["reconciliation_periods"] });
    toast.success("Period deleted");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Match Transactions</h1>
            <p className="text-muted-foreground text-sm mt-1">Compare your records against bank statements to make sure nothing's missing.</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />New Period
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Account Name</label>
                  <Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="e.g. Chase Checking" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Period Start</label>
                  <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Period End</label>
                  <Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Statement Ending Balance</label>
                  <Input type="number" value={form.statement_balance} onChange={(e) => setForm({ ...form, statement_balance: e.target.value })} placeholder="$0.00" />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button onClick={handleCreate}>Create Period</Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Statement Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id} className={`cursor-pointer ${selectedId === p.id ? "bg-accent" : ""}`} onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}>
                    <TableCell className="font-medium">{p.account_name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.period_start} — {p.period_end}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(p.statement_balance)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "reconciled" ? "outline" : "secondary"} className="text-xs">
                        {p.status === "reconciled" ? <><CheckCircle2 className="h-3 w-3 mr-1" />Reconciled</> : <><Clock className="h-3 w-3 mr-1" />Open</>}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this reconciliation period?</AlertDialogTitle>
                            <AlertDialogDescription>{p.account_name}: {p.period_start} — {p.period_end}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {periods.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="rounded-full bg-muted p-3">
                          <Scale className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="font-medium">No reconciliation periods yet</p>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          Match your bank statement to your records to make sure everything adds up. Click "New Period" to start.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            {selectedPeriod && computedBalance ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{selectedPeriod.account_name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{selectedPeriod.period_start} — {selectedPeriod.period_end}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm"><span>Sales (inflows)</span><span className="font-mono text-chart-positive">{formatCurrency(computedBalance.salesSum)}</span></div>
                  <div className="flex justify-between text-sm"><span>Expenses (outflows)</span><span className="font-mono text-chart-negative">{formatCurrency(computedBalance.expensesSum)}</span></div>
                  <div className="flex justify-between text-sm border-t pt-2"><span>Computed net</span><span className="font-mono">{formatCurrency(computedBalance.net)}</span></div>
                  <div className="flex justify-between text-sm"><span>Statement balance</span><span className="font-mono">{formatCurrency(selectedPeriod.statement_balance)}</span></div>
                  <div className={`flex justify-between text-sm font-bold border-t pt-2 ${Math.abs(computedBalance.difference) < 0.01 ? "text-chart-positive" : "text-destructive"}`}>
                    <span>Difference</span>
                    <span className="font-mono">{formatCurrency(computedBalance.difference)}</span>
                  </div>
                  {selectedPeriod.status === "open" && (
                    <Button className="w-full mt-2" disabled={Math.abs(computedBalance.difference) > 0.01} onClick={() => handleReconcile(selectedPeriod.id)}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />Mark as Reconciled
                    </Button>
                  )}
                  {selectedPeriod.status === "reconciled" && selectedPeriod.reconciled_at && (
                    <p className="text-xs text-muted-foreground text-center">Reconciled on {new Date(selectedPeriod.reconciled_at).toLocaleDateString()}</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">Select a period to view reconciliation details.</CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
