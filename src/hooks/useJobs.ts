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

  const assignWorker = async (jobId: string, workerId: string, workerName: string, workerType: string, assignedHours: number = 0) => {
    const { error } = await supabase.from("job_assignments").insert({
      job_id: jobId, worker_id: workerId, worker_name: workerName, worker_type: workerType, assigned_hours: assignedHours,
    });
    if (error) { toast.error(error.message); return; }
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
