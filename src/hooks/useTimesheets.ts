import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Timesheet {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TimesheetEntry {
  id: string;
  timesheet_id: string;
  worker_id: string;
  worker_name: string;
  worker_type: string;
  pay_rate: number;
  mon_hours: number;
  tue_hours: number;
  wed_hours: number;
  thu_hours: number;
  fri_hours: number;
  sat_hours: number;
  sun_hours: number;
  total_hours: number;
  overtime_hours: number;
  regular_pay: number;
  overtime_pay: number;
  total_pay: number;
  job_id: string | null;
  created_at: string;
}

const OT_THRESHOLD = 40;
const OT_MULTIPLIER = 1.5;

function computePay(hours: Omit<Pick<TimesheetEntry, "mon_hours" | "tue_hours" | "wed_hours" | "thu_hours" | "fri_hours" | "sat_hours" | "sun_hours">, never>, payRate: number) {
  const total = hours.mon_hours + hours.tue_hours + hours.wed_hours + hours.thu_hours + hours.fri_hours + hours.sat_hours + hours.sun_hours;
  const overtime = Math.max(0, total - OT_THRESHOLD);
  const regular = total - overtime;
  const regularPay = regular * payRate;
  const overtimePay = overtime * payRate * OT_MULTIPLIER;
  return { total_hours: total, overtime_hours: overtime, regular_pay: regularPay, overtime_pay: overtimePay, total_pay: regularPay + overtimePay };
}

export function useTimesheets() {
  const { user } = useAuth();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [tsRes, entRes] = await Promise.all([
      supabase.from("timesheets").select("*").eq("user_id", user.id).order("week_start", { ascending: false }),
      supabase.from("timesheet_entries").select("*"),
    ]);
    if (tsRes.data) setTimesheets(tsRes.data as Timesheet[]);
    if (entRes.data) setEntries(entRes.data as TimesheetEntry[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createTimesheet = async (weekStart: string, weekEnd: string) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("timesheets")
      .insert({ user_id: user.id, week_start: weekStart, week_end: weekEnd })
      .select()
      .single();
    if (error) { toast.error(error.message); return null; }
    toast.success("Timesheet created");
    fetchAll();
    return data;
  };

  const getEffectiveRate = async (workerName: string, workerType: string, weekStart: string, defaultRate: number): Promise<number> => {
    // Look up if there's a scheduled rate change that's now effective
    // Find the most recent pay_rate_change for this worker that's effective on or before the timesheet week
    if (!user) return defaultRate;
    
    // Get team member by name
    const { data: tm } = await supabase
      .from("team_members")
      .select("id, pay_rate")
      .eq("business_user_id", user.id)
      .eq("name", workerName)
      .maybeSingle();
    if (!tm) return defaultRate;

    // Check for the most recent effective rate change
    const { data: rateChange } = await supabase
      .from("pay_rate_changes")
      .select("new_rate, effective_date")
      .eq("team_member_id", tm.id)
      .lte("effective_date", weekStart)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    return rateChange ? rateChange.new_rate : tm.pay_rate;
  };

  const addEntry = async (entry: {
    timesheet_id: string;
    worker_id: string;
    worker_name: string;
    worker_type: string;
    pay_rate: number;
    mon_hours: number;
    tue_hours: number;
    wed_hours: number;
    thu_hours: number;
    fri_hours: number;
    sat_hours: number;
    sun_hours: number;
    job_id: string | null;
  }) => {
    // Get the timesheet's week_start to determine effective rate
    const ts = timesheets.find((t) => t.id === entry.timesheet_id);
    const effectiveRate = ts
      ? await getEffectiveRate(entry.worker_name, entry.worker_type, ts.week_start, entry.pay_rate)
      : entry.pay_rate;
    
    const calc = computePay(entry, effectiveRate);
    const { error } = await supabase.from("timesheet_entries").insert({ ...entry, pay_rate: effectiveRate, ...calc });
    if (error) { toast.error(error.message); return; }

    // Auto-create job_assignment if a job is selected so crew members can see assigned work
    if (entry.job_id) {
      const { data: existing } = await supabase
        .from("job_assignments")
        .select("id")
        .eq("job_id", entry.job_id)
        .eq("worker_id", entry.worker_id)
        .maybeSingle();
      if (!existing) {
        await supabase.from("job_assignments").insert({
          job_id: entry.job_id,
          worker_id: entry.worker_id,
          worker_name: entry.worker_name,
          worker_type: entry.worker_type,
        });
      }
    }

    fetchAll();
  };

  const updateEntry = async (id: string, updates: Partial<TimesheetEntry>) => {
    // If hours or pay_rate changed, recompute
    const existing = entries.find((e) => e.id === id);
    if (existing) {
      const merged = { ...existing, ...updates };
      const hourFields = { mon_hours: merged.mon_hours, tue_hours: merged.tue_hours, wed_hours: merged.wed_hours, thu_hours: merged.thu_hours, fri_hours: merged.fri_hours, sat_hours: merged.sat_hours, sun_hours: merged.sun_hours };
      const calc = computePay(hourFields, merged.pay_rate);
      updates = { ...updates, ...calc };
    }
    const { error } = await supabase.from("timesheet_entries").update(updates).eq("id", id);
    if (error) { toast.error(error.message); return; }
    fetchAll();
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from("timesheet_entries").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    fetchAll();
  };

  // Recalculate contractor total_paid from ALL submitted timesheets
  const recalcContractorTotals = async () => {
    if (!user) return;
    // Get all submitted timesheets for this user
    const { data: submittedTs } = await supabase
      .from("timesheets")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "submitted");
    const submittedIds = (submittedTs || []).map((t: any) => t.id);

    // Get all contractor entries across submitted timesheets
    const { data: allContractorEntries } = submittedIds.length > 0
      ? await supabase
          .from("timesheet_entries")
          .select("worker_name, worker_type, total_pay")
          .in("timesheet_id", submittedIds)
          .eq("worker_type", "contractor")
      : { data: [] };

    // Sum totals by contractor name
    const totals = new Map<string, number>();
    (allContractorEntries || []).forEach((e: any) => {
      totals.set(e.worker_name, (totals.get(e.worker_name) || 0) + e.total_pay);
    });

    // Get all contractors for this user
    const { data: contractors } = await supabase
      .from("contractors")
      .select("id, name, total_paid")
      .eq("user_id", user.id);

    // Update each contractor's total_paid
    for (const c of contractors || []) {
      const newTotal = totals.get(c.name) || 0;
      if (Math.abs(c.total_paid - newTotal) > 0.001) {
        await supabase
          .from("contractors")
          .update({ total_paid: newTotal })
          .eq("id", c.id);
      }
    }
  };

  const submitTimesheet = async (id: string) => {
    const { error } = await supabase.from("timesheets").update({ status: "submitted" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await recalcContractorTotals();
    toast.success("Timesheet submitted");
    fetchAll();
  };

  const reopenTimesheet = async (id: string) => {
    const { error } = await supabase.from("timesheets").update({ status: "draft" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await recalcContractorTotals();
    toast.success("Timesheet reopened");
    fetchAll();
  };

  const deleteTimesheet = async (id: string) => {
    await supabase.from("timesheet_entries").delete().eq("timesheet_id", id);
    const { error } = await supabase.from("timesheets").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await recalcContractorTotals();
    toast.success("Timesheet deleted");
    fetchAll();
  };

  return {
    timesheets, entries, loading,
    createTimesheet, addEntry, updateEntry, deleteEntry,
    submitTimesheet, reopenTimesheet, deleteTimesheet,
    refetch: fetchAll,
  };
}
