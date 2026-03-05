import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface JobSite {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number | null;
  notes: string | null;
  client_id: string | null;
  user_id: string;
  created_at: string;
}

export interface Job {
  id: string;
  title: string;
  description: string | null;
  site_id: string;
  client_id: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  estimated_hours: number | null;
  status: string;
  job_type: string;
  recurring_interval: string | null;
  recurring_end_date: string | null;
  invoice_id: string | null;
  price: number;
  material_budget: number;
  labor_budget_type: string;
  labor_budget_amount: number;
  labor_budget_hours: number;
  labor_budget_rate: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}


export interface JobAssignment {
  id: string;
  job_id: string;
  worker_id: string;
  worker_name: string;
  worker_type: string;
  assigned_hours: number;
  created_at: string;
}

export function useJobs() {
  const { user } = useAuth();
  const [sites, setSites] = useState<JobSite[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [sitesRes, jobsRes, assignRes] = await Promise.all([
      supabase.from("job_sites").select("*").eq("user_id", user.id).order("name"),
      supabase.from("jobs").select("*").eq("user_id", user.id).order("start_date", { ascending: false }),
      supabase.from("job_assignments").select("*"),
    ]);

    if (sitesRes.data) setSites(sitesRes.data as JobSite[]);
    if (jobsRes.data) setJobs(jobsRes.data as Job[]);
    if (assignRes.data) setAssignments(assignRes.data as JobAssignment[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const createSite = async (site: Omit<JobSite, "id" | "created_at" | "user_id">) => {
    if (!user) return;
    const { error } = await supabase.from("job_sites").insert({ ...site, user_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Site created");
    fetchAll();
  };

  const updateSite = async (id: string, updates: Partial<JobSite>) => {
    const { error } = await supabase.from("job_sites").update(updates).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Site updated");
    fetchAll();
  };

  const deleteSite = async (id: string) => {
    const { error } = await supabase.from("job_sites").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Site deleted");
    fetchAll();
  };

  const createJob = async (job: Omit<Job, "id" | "created_at" | "updated_at" | "user_id">) => {
    if (!user) return;
    const { error } = await supabase.from("jobs").insert({ ...job, user_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Job created");
    fetchAll();
  };

  const updateJob = async (id: string, updates: Partial<Job>) => {
    const { error } = await supabase.from("jobs").update(updates).eq("id", id);
    if (error) { toast.error(error.message); return; }
    fetchAll();
  };

  const deleteJob = async (id: string) => {
    await supabase.from("job_assignments").delete().eq("job_id", id);
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Job deleted");
    fetchAll();
  };

  /** Given a date string, return the day_hours key */
  const dayKeyFromDate = (dateStr: string): string => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    const map: Record<number, string> = { 0: "sun_hours", 1: "mon_hours", 2: "tue_hours", 3: "wed_hours", 4: "thu_hours", 5: "fri_hours", 6: "sat_hours" };
    return map[dayOfWeek];
  };

  /** Sync a job assignment to any draft timesheets covering the job's dates */
  const syncAssignmentToTimesheets = async (jobId: string, workerId: string, workerName: string, workerType: string, assignedHours: number) => {
    if (!user || assignedHours <= 0) return;

    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    // Get worker pay rate from team_members
    const { data: tm } = await supabase
      .from("team_members")
      .select("pay_rate, worker_type")
      .eq("id", workerId)
      .maybeSingle();
    const payRate = tm?.pay_rate || 0;
    const isContractor = (tm?.worker_type || workerType) === "1099";

    // Find all draft timesheets for this user
    const { data: drafts } = await supabase
      .from("timesheets")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "draft");
    if (!drafts || drafts.length === 0) return;

    // Determine job day range
    const jobStart = job.start_date;
    const jobEnd = job.end_date || job.start_date;

    // Count how many days the job spans
    const startD = new Date(Number(jobStart.split("-")[0]), Number(jobStart.split("-")[1]) - 1, Number(jobStart.split("-")[2]));
    const endD = new Date(Number(jobEnd.split("-")[0]), Number(jobEnd.split("-")[1]) - 1, Number(jobEnd.split("-")[2]));
    let jobDayCount = 0;
    const cursor = new Date(startD);
    while (cursor <= endD) { jobDayCount++; cursor.setDate(cursor.getDate() + 1); }
    const hoursPerDay = jobDayCount > 0 ? assignedHours / jobDayCount : assignedHours;

    for (const ts of drafts) {
      const wsD = new Date(Number(ts.week_start.split("-")[0]), Number(ts.week_start.split("-")[1]) - 1, Number(ts.week_start.split("-")[2]));
      const weD = new Date(Number(ts.week_end.split("-")[0]), Number(ts.week_end.split("-")[1]) - 1, Number(ts.week_end.split("-")[2]));

      // Check if any job day falls within this timesheet week
      const dayHours: Record<string, number> = {
        mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0,
        fri_hours: 0, sat_hours: 0, sun_hours: 0,
      };
      let hasOverlap = false;
      const c2 = new Date(startD);
      while (c2 <= endD) {
        if (c2 >= wsD && c2 <= weD) {
          const key = dayKeyFromDate(`${c2.getFullYear()}-${String(c2.getMonth() + 1).padStart(2, "0")}-${String(c2.getDate()).padStart(2, "0")}`);
          dayHours[key] = hoursPerDay;
          hasOverlap = true;
        }
        c2.setDate(c2.getDate() + 1);
      }
      if (!hasOverlap) continue;

      // Check if entry already exists for this worker+job on this timesheet
      const { data: existing } = await supabase
        .from("timesheet_entries")
        .select("id")
        .eq("timesheet_id", ts.id)
        .eq("worker_id", workerId)
        .eq("job_id", jobId)
        .maybeSingle();
      if (existing) continue;

      // Compute pay
      const totalHrs = Object.values(dayHours).reduce((s, h) => s + h, 0);
      const overtime = Math.max(0, totalHrs - 40);
      const regular = totalHrs - overtime;
      const regularPay = regular * payRate;
      const overtimePay = overtime * payRate * 1.5;

      await supabase.from("timesheet_entries").insert({
        timesheet_id: ts.id,
        worker_id: workerId,
        worker_name: workerName,
        worker_type: isContractor ? "contractor" : "employee",
        pay_rate: payRate,
        ...dayHours,
        total_hours: totalHrs,
        overtime_hours: overtime,
        regular_pay: regularPay,
        overtime_pay: overtimePay,
        total_pay: regularPay + overtimePay,
        job_id: jobId,
      });
    }
  };

  const assignWorker = async (jobId: string, workerId: string, workerName: string, workerType: string, assignedHours: number = 0) => {
    const { error } = await supabase.from("job_assignments").insert({
      job_id: jobId, worker_id: workerId, worker_name: workerName, worker_type: workerType, assigned_hours: assignedHours,
    });
    if (error) { toast.error(error.message); return; }

    // Sync to draft timesheets
    await syncAssignmentToTimesheets(jobId, workerId, workerName, workerType, assignedHours);

    toast.success("Worker assigned");
    fetchAll();
  };

  const removeAssignment = async (id: string) => {
    const { error } = await supabase.from("job_assignments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    fetchAll();
  };

  return {
    sites, jobs, assignments, loading,
    createSite, updateSite, deleteSite,
    createJob, updateJob, deleteJob,
    assignWorker, removeAssignment,
    refetch: fetchAll,
  };
}
