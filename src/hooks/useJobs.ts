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
  billing_interval: string | null;
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
  hours_per_day: number;
  assigned_days: string[] | null;
  created_at: string;
}

export interface CrewCheckinOccurrence {
  id: string;
  job_id: string | null;
  occurrence_date: string | null;
  status: string;
  check_in_time: string;
  check_out_time: string | null;
}

export function useJobs() {
  const { user } = useAuth();
  const [sites, setSites] = useState<JobSite[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [checkins, setCheckins] = useState<CrewCheckinOccurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [sitesRes, jobsRes, assignRes, checkinsRes] = await Promise.all([
      supabase.from("job_sites").select("*").eq("user_id", user.id).order("name"),
      supabase.from("jobs").select("*").eq("user_id", user.id).order("start_date", { ascending: false }),
      supabase.from("job_assignments").select("*"),
      supabase.from("crew_checkins").select("id, job_id, occurrence_date, status, check_in_time, check_out_time"),
    ]);

    if (sitesRes.data) setSites(sitesRes.data as JobSite[]);
    if (jobsRes.data) setJobs(jobsRes.data as Job[]);
    if (assignRes.data) setAssignments(assignRes.data as JobAssignment[]);
    if (checkinsRes.data) setCheckins(checkinsRes.data as CrewCheckinOccurrence[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!user) return;
    const jobsChannel = supabase
      .channel("jobs_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: `user_id=eq.${user.id}` },
        () => fetchAll(),
      )
      .subscribe();

    const checkinsChannel = supabase
      .channel("crew_checkins_business_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crew_checkins" },
        () => fetchAll(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(jobsChannel);
      supabase.removeChannel(checkinsChannel);
    };
  }, [user, fetchAll]);

  const createSite = async (site: Omit<JobSite, "id" | "created_at" | "user_id">) => {
    if (!user) return;
    const { error } = await supabase.from("job_sites").insert({ ...site, user_id: user.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Site created");
    fetchAll();
  };

  const updateSite = async (id: string, updates: Partial<JobSite>) => {
    const { error } = await supabase.from("job_sites").update(updates).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Site updated");
    fetchAll();
  };

  const deleteSite = async (id: string) => {
    const { error } = await supabase.from("job_sites").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Site deleted");
    fetchAll();
  };

  const createJob = async (job: Omit<Job, "id" | "created_at" | "updated_at" | "user_id">): Promise<string | undefined> => {
    if (!user) return;
    const { data, error } = await supabase.from("jobs").insert({ ...job, user_id: user.id }).select("id").single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Job created");
    fetchAll();
    return data?.id;
  };

  const syncAssignmentHoursToJob = async (jobId: string, newEstimatedHours: number | null, oldEstimatedHours: number | null = null) => {
    if (!newEstimatedHours || newEstimatedHours <= 0) return;
    const jobAssignments = assignments.filter(a => a.job_id === jobId);
    if (jobAssignments.length === 0) return;

    const job = jobs.find(j => j.id === jobId);
    const isMultiDay = job && job.end_date && job.end_date !== job.start_date;

    for (const a of jobAssignments) {
      const dayCount = isMultiDay
        ? (a.assigned_days?.length || (() => {
            const s = new Date(job!.start_date);
            const e = new Date(job!.end_date!);
            return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
          })())
        : 1;

      // Only auto-update if: hours are 0, or hours match the old estimated (not manually overridden)
      const wasAutoFilled = a.assigned_hours <= 0
        || (oldEstimatedHours && Math.abs(a.assigned_hours - oldEstimatedHours) < 0.01);
      if (!wasAutoFilled) continue;

      const hpd = Math.round((newEstimatedHours / dayCount) * 10) / 10;
      const totalHrs = hpd * dayCount;
      await supabase.from("job_assignments").update({
        assigned_hours: totalHrs,
        hours_per_day: hpd,
      }).eq("id", a.id);
    }
  };

  const updateJob = async (id: string, updates: Partial<Job>) => {
    const { error } = await supabase.from("jobs").update(updates).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    // If estimated_hours changed, sync all assignments
    if (updates.estimated_hours !== undefined) {
      await syncAssignmentHoursToJob(id, updates.estimated_hours ?? null);
    }

    fetchAll();
  };

  const updateJobsBatch = async (jobUpdates: Array<{ id: string; updates: Partial<Job> }>) => {
    if (jobUpdates.length === 0) return;
    const results = await Promise.all(
      jobUpdates.map(({ id, updates }) => supabase.from("jobs").update(updates).eq("id", id)),
    );
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      toast.error(firstError.message);
      return;
    }
    fetchAll();
  };

  const deleteJob = async (id: string) => {
    if (!user) return;

    // 1. Get all timesheet entries linked to this job and reverse pay impacts
    const { data: tsEntries } = await supabase
      .from("timesheet_entries")
      .select("id, worker_name, worker_type, total_pay, timesheet_id")
      .eq("job_id", id);

    if (tsEntries && tsEntries.length > 0) {
      // Collect pay to reverse per worker
      const payToReverse = new Map<string, number>();
      for (const entry of tsEntries) {
        const key = `${entry.worker_name}::${entry.worker_type}`;
        payToReverse.set(key, (payToReverse.get(key) || 0) + entry.total_pay);
      }

      // Reverse contractor totals
      for (const [key, amount] of payToReverse) {
        const [name, type] = key.split("::");
        if (type === "contractor" || type === "1099") {
          const { data: contractor } = await supabase
            .from("contractors")
            .select("id, total_paid")
            .eq("user_id", user.id)
            .eq("name", name)
            .maybeSingle();
          if (contractor) {
            await supabase.from("contractors").update({
              total_paid: Math.max(0, (contractor.total_paid || 0) - amount),
            }).eq("id", contractor.id);
          }
        } else {
          const { data: employee } = await supabase
            .from("employees")
            .select("id, salary")
            .eq("user_id", user.id)
            .eq("name", name)
            .maybeSingle();
          if (employee) {
            await supabase.from("employees").update({
              salary: Math.max(0, (employee.salary || 0) - amount),
            }).eq("id", employee.id);
          }
        }
      }

      // Delete timesheet entries for this job
      await supabase.from("timesheet_entries").delete().in("id", tsEntries.map(e => e.id));
    }

    // 2. Delete crew checkins for this job
    await supabase.from("crew_checkins").delete().eq("job_id", id);

    // 3. Delete job photos
    await supabase.from("job_photos").delete().eq("job_id", id);

    // 4. Delete job expenses links
    await supabase.from("job_expenses").delete().eq("job_id", id);

    // 5. Unlink invoices referencing this job
    await supabase.from("invoices").update({ job_id: null }).eq("job_id", id);

    // 6. Delete assignments
    await supabase.from("job_assignments").delete().eq("job_id", id);

    // 7. Delete the job itself
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Job deleted");
    fetchAll();
  };

  const dayKeyFromDate = (dateStr: string): string => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    const map: Record<number, string> = { 0: "sun_hours", 1: "mon_hours", 2: "tue_hours", 3: "wed_hours", 4: "thu_hours", 5: "fri_hours", 6: "sat_hours" };
    return map[dayOfWeek];
  };

  const syncAssignmentToTimesheets = async (jobId: string, workerId: string, workerName: string, workerType: string, assignedHours: number) => {
    if (!user || assignedHours <= 0) return;

    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    const { data: tm } = await supabase
      .from("team_members")
      .select("pay_rate, worker_type")
      .eq("id", workerId)
      .maybeSingle();
    const payRate = tm?.pay_rate || 0;
    const isContractor = (tm?.worker_type || workerType) === "1099";

    const { data: drafts } = await supabase
      .from("timesheets")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "draft");
    if (!drafts || drafts.length === 0) return;

    const jobStart = job.start_date;
    const jobEnd = job.end_date || job.start_date;

    const startD = new Date(Number(jobStart.split("-")[0]), Number(jobStart.split("-")[1]) - 1, Number(jobStart.split("-")[2]));
    const endD = new Date(Number(jobEnd.split("-")[0]), Number(jobEnd.split("-")[1]) - 1, Number(jobEnd.split("-")[2]));
    let jobDayCount = 0;
    const cursor = new Date(startD);
    while (cursor <= endD) {
      jobDayCount++;
      cursor.setDate(cursor.getDate() + 1);
    }
    const hoursPerDay = jobDayCount > 0 ? assignedHours / jobDayCount : assignedHours;

    for (const ts of drafts) {
      const wsD = new Date(Number(ts.week_start.split("-")[0]), Number(ts.week_start.split("-")[1]) - 1, Number(ts.week_start.split("-")[2]));
      const weD = new Date(Number(ts.week_end.split("-")[0]), Number(ts.week_end.split("-")[1]) - 1, Number(ts.week_end.split("-")[2]));

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

      const { data: existing } = await supabase
        .from("timesheet_entries")
        .select("id")
        .eq("timesheet_id", ts.id)
        .eq("worker_id", workerId)
        .eq("job_id", jobId)
        .maybeSingle();
      if (existing) continue;

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

  const assignWorker = async (jobId: string, workerId: string, workerName: string, workerType: string, assignedHours: number = 0, hoursPerDay: number = 0, assignedDays: string[] | null = null) => {
    // Auto-fill from job's estimated_hours if no hours provided
    let finalHours = assignedHours;
    let finalHpd = hoursPerDay;
    if (finalHours <= 0) {
      const job = jobs.find(j => j.id === jobId);
      if (job?.estimated_hours && job.estimated_hours > 0) {
        const isMultiDay = job.end_date && job.end_date !== job.start_date;
        const dayCount = isMultiDay
          ? (assignedDays?.length || (() => {
              const s = new Date(job.start_date);
              const e = new Date(job.end_date!);
              return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
            })())
          : 1;
        finalHpd = Math.round((job.estimated_hours / dayCount) * 10) / 10;
        finalHours = finalHpd * dayCount;
      }
    }

    const { error } = await supabase.from("job_assignments").insert({
      job_id: jobId, worker_id: workerId, worker_name: workerName, worker_type: workerType,
      assigned_hours: finalHours, hours_per_day: finalHpd, assigned_days: assignedDays,
    } as any);
    if (error) {
      toast.error(error.message);
      return;
    }

    await syncAssignmentToTimesheets(jobId, workerId, workerName, workerType, finalHours);

    toast.success("Worker assigned");
    fetchAll();
  };

  const removeAssignment = async (id: string) => {
    const { error } = await supabase.from("job_assignments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    fetchAll();
  };

  return {
    sites,
    jobs,
    assignments,
    checkins,
    loading,
    createSite,
    updateSite,
    deleteSite,
    createJob,
    updateJob,
    updateJobsBatch,
    deleteJob,
    assignWorker,
    removeAssignment,
    refetch: fetchAll,
  };
}
