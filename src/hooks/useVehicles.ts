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
  depreciation_method: string;
  placed_in_service_date: string | null;
  business_use_pct: number;
  useful_life_years: number;
  section_179_amount: number;
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
  isExtra?: boolean;
}

// ── MACRS depreciation rates (5-year property, 200% DB, half-year convention) ──
const MACRS_5YR = [0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576];
const MACRS_7YR = [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446];

export interface DepreciationRow {
  year: number;
  calendarYear: number;
  beginningValue: number;
  depreciation: number;
  endingValue: number;
  businessDepreciation: number;
}

export function calculateDepreciation(vehicle: Vehicle): DepreciationRow[] {
  const cost = vehicle.purchase_price;
  const sec179 = Math.min(vehicle.section_179_amount, cost);
  const depreciableBasis = cost - sec179;
  const pct = vehicle.business_use_pct / 100;
  const startYear = vehicle.placed_in_service_date
    ? new Date(vehicle.placed_in_service_date).getFullYear()
    : vehicle.year ?? new Date().getFullYear();

  const rates = vehicle.useful_life_years <= 5 ? MACRS_5YR : MACRS_7YR;
  const rows: DepreciationRow[] = [];

  // Section 179 in year 1
  if (sec179 > 0) {
    rows.push({
      year: 0,
      calendarYear: startYear,
      beginningValue: cost,
      depreciation: sec179,
      endingValue: cost - sec179,
      businessDepreciation: Math.round(sec179 * pct * 100) / 100,
    });
  }

  let remaining = depreciableBasis;
  for (let i = 0; i < rates.length && remaining > 0.01; i++) {
    const dep = Math.round(depreciableBasis * rates[i] * 100) / 100;
    const actual = Math.min(dep, remaining);
    remaining -= actual;
    rows.push({
      year: i + 1,
      calendarYear: startYear + i,
      beginningValue: Math.round((depreciableBasis - (depreciableBasis - remaining - actual)) * 100) / 100,
      depreciation: actual,
      endingValue: Math.round(remaining * 100) / 100,
      businessDepreciation: Math.round(actual * pct * 100) / 100,
    });
  }
  return rows;
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
        depreciation_method: r.depreciation_method,
        placed_in_service_date: r.placed_in_service_date,
        business_use_pct: Number(r.business_use_pct),
        useful_life_years: r.useful_life_years,
        section_179_amount: Number(r.section_179_amount),
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
        depreciation_method: v.depreciation_method,
        placed_in_service_date: v.placed_in_service_date,
        business_use_pct: v.business_use_pct,
        useful_life_years: v.useful_life_years,
        section_179_amount: v.section_179_amount,
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
