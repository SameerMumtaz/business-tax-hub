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
    const calc = computePay(entry, entry.pay_rate);
    const { error } = await supabase.from("timesheet_entries").insert({ ...entry, ...calc });
    if (error) { toast.error(error.message); return; }
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

  const syncContractorTotals = async (timesheetId: string) => {
    // Get all entries for this timesheet that are contractors
    const tsEntries = entries.filter((e) => e.timesheet_id === timesheetId && e.worker_type === "contractor");
    for (const entry of tsEntries) {
      // Get current contractor total
      const { data: contractor } = await supabase
        .from("contractors")
        .select("id, total_paid, name")
        .eq("name", entry.worker_name)
        .maybeSingle();
      if (contractor) {
        await supabase
          .from("contractors")
          .update({ total_paid: contractor.total_paid + entry.total_pay })
          .eq("id", contractor.id);
      }
    }
  };

  const submitTimesheet = async (id: string) => {
    const { error } = await supabase.from("timesheets").update({ status: "submitted" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    // Sync contractor totals on submit
    await syncContractorTotals(id);
    toast.success("Timesheet submitted");
    fetchAll();
  };

  const reopenTimesheet = async (id: string) => {
    const { error } = await supabase.from("timesheets").update({ status: "draft" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Timesheet reopened");
    fetchAll();
  };

  const deleteTimesheet = async (id: string) => {
    // Delete entries first, then timesheet
    await supabase.from("timesheet_entries").delete().eq("timesheet_id", id);
    const { error } = await supabase.from("timesheets").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
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
