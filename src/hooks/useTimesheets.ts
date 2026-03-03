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

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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

  const addEntry = async (entry: Omit<TimesheetEntry, "id" | "created_at">) => {
    const { error } = await supabase.from("timesheet_entries").insert(entry);
    if (error) { toast.error(error.message); return; }
    fetchAll();
  };

  const updateEntry = async (id: string, updates: Partial<TimesheetEntry>) => {
    const { error } = await supabase.from("timesheet_entries").update(updates).eq("id", id);
    if (error) { toast.error(error.message); return; }
    fetchAll();
  };

  const submitTimesheet = async (id: string) => {
    const { error } = await supabase.from("timesheets").update({ status: "submitted" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Timesheet submitted");
    fetchAll();
  };

  return { timesheets, entries, loading, createTimesheet, addEntry, updateEntry, submitTimesheet, refetch: fetchAll };
}
