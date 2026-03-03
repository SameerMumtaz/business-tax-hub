import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Vehicle {
  id: string;
  name: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin_last6: string | null;
  purchase_price: number;
  loan_amount: number;
  interest_rate: number;
  loan_term_months: number;
  monthly_payment: number;
  loan_start_date: string | null;
  status: string;
  notes: string | null;
}

export interface VehiclePayment {
  id: string;
  vehicle_id: string;
  payment_number: number;
  amount_paid: number;
  principal_portion: number;
  interest_portion: number;
  date_paid: string;
  notes: string | null;
}

export interface VehicleExpenseLink {
  id: string;
  vehicle_id: string;
  expense_id: string;
}

export interface AmortRow {
  number: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  paid: boolean;
  paidDate?: string;
}

// ── Amortization calculator ──

export function generateAmortSchedule(
  loanAmount: number,
  annualRate: number,
  termMonths: number,
  monthlyPayment: number,
  startDate: string | null,
  payments: VehiclePayment[]
): AmortRow[] {
  const rows: AmortRow[] = [];
  let balance = loanAmount;
  const monthlyRate = annualRate / 100 / 12;
  const start = startDate ? new Date(startDate + "T00:00:00") : new Date();

  const paidMap = new Map<number, VehiclePayment>();
  payments.forEach((p) => paidMap.set(p.payment_number, p));

  for (let i = 1; i <= termMonths && balance > 0.01; i++) {
    const interest = balance * monthlyRate;
    const principal = Math.min(monthlyPayment - interest, balance);
    balance = Math.max(balance - principal, 0);

    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + i);
    const dateStr = dueDate.toISOString().slice(0, 10);

    const paid = paidMap.has(i);
    rows.push({
      number: i,
      date: dateStr,
      payment: monthlyPayment,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      paid,
      paidDate: paid ? paidMap.get(i)!.date_paid : undefined,
    });
  }
  return rows;
}

// ── Hooks ──

export function useVehicles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["vehicles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        year: r.year,
        make: r.make,
        model: r.model,
        vin_last6: r.vin_last6,
        purchase_price: Number(r.purchase_price),
        loan_amount: Number(r.loan_amount),
        interest_rate: Number(r.interest_rate),
        loan_term_months: r.loan_term_months,
        monthly_payment: Number(r.monthly_payment),
        loan_start_date: r.loan_start_date,
        status: r.status,
        notes: r.notes,
      })) as Vehicle[];
    },
  });
}

export function useAddVehicle() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Omit<Vehicle, "id">) => {
      const { error } = await supabase.from("vehicles").insert({
        user_id: user!.id,
        name: v.name,
        year: v.year,
        make: v.make,
        model: v.model,
        vin_last6: v.vin_last6,
        purchase_price: v.purchase_price,
        loan_amount: v.loan_amount,
        interest_rate: v.interest_rate,
        loan_term_months: v.loan_term_months,
        monthly_payment: v.monthly_payment,
        loan_start_date: v.loan_start_date,
        status: v.status,
        notes: v.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Vehicle> & { id: string }) => {
      const { error } = await supabase.from("vehicles").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useRemoveVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

// ── Payments ──

export function useVehiclePayments(vehicleId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["vehicle_payments", vehicleId],
    enabled: !!user && !!vehicleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_payments")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("payment_number", { ascending: true });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        vehicle_id: r.vehicle_id,
        payment_number: r.payment_number,
        amount_paid: Number(r.amount_paid),
        principal_portion: Number(r.principal_portion),
        interest_portion: Number(r.interest_portion),
        date_paid: r.date_paid,
        notes: r.notes,
      })) as VehiclePayment[];
    },
  });
}

export function useAddVehiclePayment() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Omit<VehiclePayment, "id">) => {
      const { error } = await supabase.from("vehicle_payments").insert({
        user_id: user!.id,
        vehicle_id: p.vehicle_id,
        payment_number: p.payment_number,
        amount_paid: p.amount_paid,
        principal_portion: p.principal_portion,
        interest_portion: p.interest_portion,
        date_paid: p.date_paid,
        notes: p.notes,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["vehicle_payments", vars.vehicle_id] }),
  });
}

export function useRemoveVehiclePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, vehicleId }: { id: string; vehicleId: string }) => {
      const { error } = await supabase.from("vehicle_payments").delete().eq("id", id);
      if (error) throw error;
      return vehicleId;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["vehicle_payments", vars.vehicleId] }),
  });
}

// ── Vehicle Expenses linking ──

export function useVehicleExpenses(vehicleId: string | null) {
  return useQuery({
    queryKey: ["vehicle_expenses", vehicleId],
    enabled: !!vehicleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_expenses")
        .select("*, expenses(*)")
        .eq("vehicle_id", vehicleId!);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useLinkExpenseToVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vehicleId, expenseId }: { vehicleId: string; expenseId: string }) => {
      const { error } = await supabase.from("vehicle_expenses").insert({
        vehicle_id: vehicleId,
        expense_id: expenseId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["vehicle_expenses", vars.vehicleId] }),
  });
}

export function useUnlinkExpenseFromVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, vehicleId }: { id: string; vehicleId: string }) => {
      const { error } = await supabase.from("vehicle_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["vehicle_expenses", vars.vehicleId] }),
  });
}
