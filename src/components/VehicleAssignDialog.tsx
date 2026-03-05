import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVehicles, useLinkExpenseToVehicle, useAddVehiclePayment, useVehiclePayments, generateAmortSchedule } from "@/hooks/useVehicles";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { Car } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseId: string;
  expenseAmount: number;
  expenseDate: string;
}

export default function VehicleAssignDialog({ open, onOpenChange, expenseId, expenseAmount, expenseDate }: Props) {
  const { data: vehicles = [] } = useVehicles();
  const linkExpense = useLinkExpenseToVehicle();
  const addPayment = useAddVehiclePayment();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [recordAsPayment, setRecordAsPayment] = useState(true);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  const handleAssign = async () => {
    if (!selectedVehicleId) {
      toast.error("Please select a vehicle");
      return;
    }

    try {
      // Link expense to vehicle
      await linkExpense.mutateAsync({ vehicleId: selectedVehicleId, expenseId });

      // Optionally record as a loan payment
      if (recordAsPayment && selectedVehicle && selectedVehicle.loan_amount > 0) {
        // Fetch all existing payments to compute running balance accurately
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: allPayments } = await supabase
          .from("vehicle_payments")
          .select("*")
          .eq("vehicle_id", selectedVehicleId)
          .order("payment_number", { ascending: true });

        const existingPayments = (allPayments || []).map(p => ({
          ...p,
          amount_paid: Number(p.amount_paid),
          principal_portion: Number(p.principal_portion),
          interest_portion: Number(p.interest_portion),
        }));

        const nextPaymentNum = existingPayments.length > 0
          ? existingPayments[existingPayments.length - 1].payment_number + 1
          : 1;

        // Walk through all prior payments to get the actual current balance
        const monthlyRate = selectedVehicle.interest_rate / 100 / 12;
        let balance = selectedVehicle.loan_amount;
        for (const p of existingPayments) {
          balance = Math.max(balance - p.principal_portion, 0);
        }

        // Calculate interest on current balance
        const interest = Math.round(balance * monthlyRate * 100) / 100;
        const expectedPayment = selectedVehicle.monthly_payment;

        // If expense amount > expected payment, the extra goes to principal
        const totalPrincipal = Math.min(
          Math.round((expenseAmount - interest) * 100) / 100,
          balance
        );

        const isOverpayment = expenseAmount > expectedPayment + 0.01;
        const extraPrincipal = isOverpayment
          ? Math.round((expenseAmount - expectedPayment) * 100) / 100
          : 0;

        await addPayment.mutateAsync({
          vehicle_id: selectedVehicleId,
          payment_number: nextPaymentNum,
          amount_paid: expenseAmount,
          principal_portion: Math.max(totalPrincipal, 0),
          interest_portion: Math.max(interest, 0),
          date_paid: expenseDate,
          notes: isOverpayment
            ? `Linked from expense — includes ${formatCurrency(extraPrincipal)} extra toward principal`
            : "Linked from expense",
        });
      }

      toast.success(`Linked to ${selectedVehicle?.name ?? "vehicle"}${recordAsPayment ? " & recorded payment" : ""}`);
      setSelectedVehicleId("");
      setRecordAsPayment(true);
      onOpenChange(false);
    } catch {
      toast.error("Failed to assign to vehicle");
    }
  };

  const activeVehicles = vehicles.filter(v => v.status === "active");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" /> Assign to Vehicle
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Link this {formatCurrency(expenseAmount)} expense to a financed vehicle.
        </p>

        <div className="space-y-4">
          <div>
            <Label>Vehicle</Label>
            <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select a vehicle…" /></SelectTrigger>
              <SelectContent>
                {activeVehicles.length === 0 ? (
                  <SelectItem value="__none" disabled>No vehicles — add one first</SelectItem>
                ) : (
                  activeVehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} {v.year ? `(${v.year})` : ""} — {formatCurrency(v.monthly_payment)}/mo
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedVehicle && selectedVehicle.loan_amount > 0 && (
            <>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={recordAsPayment}
                  onCheckedChange={(v) => setRecordAsPayment(!!v)}
                  id="record-payment"
                />
                <Label htmlFor="record-payment" className="font-normal text-sm">
                  Also record as a loan payment on the amortization schedule
                </Label>
              </div>
              {recordAsPayment && expenseAmount > selectedVehicle.monthly_payment + 0.01 && (
                <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                  <p className="font-medium text-foreground">Overpayment detected</p>
                  <p className="text-muted-foreground">
                    Expected: {formatCurrency(selectedVehicle.monthly_payment)} — Actual: {formatCurrency(expenseAmount)}
                  </p>
                  <p className="text-muted-foreground">
                    The extra <span className="font-mono font-medium text-foreground">{formatCurrency(expenseAmount - selectedVehicle.monthly_payment)}</span> will be applied as additional principal, reducing your loan balance faster.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Skip</Button>
            <Button onClick={handleAssign} disabled={!selectedVehicleId || linkExpense.isPending}>
              Assign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
