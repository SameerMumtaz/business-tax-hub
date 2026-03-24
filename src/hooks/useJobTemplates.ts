import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface JobTemplate {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  estimated_hours: number | null;
  price: number;
  material_budget: number;
  labor_budget_type: string;
  labor_budget_amount: number;
  labor_budget_hours: number;
  labor_budget_rate: number;
  default_crew: { worker_id: string; worker_name: string }[];
  created_at: string;
  updated_at: string;
}

export function useJobTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("job_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("title");
    if (error) { toast.error("Failed to load templates"); }
    setTemplates((data || []).map((t: any) => ({
      ...t,
      default_crew: Array.isArray(t.default_crew) ? t.default_crew : [],
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const createTemplate = async (t: Omit<JobTemplate, "id" | "user_id" | "created_at" | "updated_at">) => {
    if (!user) return;
    const { error } = await supabase.from("job_templates").insert({
      user_id: user.id,
      title: t.title,
      description: t.description,
      estimated_hours: t.estimated_hours,
      price: t.price,
      material_budget: t.material_budget,
      labor_budget_type: t.labor_budget_type,
      labor_budget_amount: t.labor_budget_amount,
      labor_budget_hours: t.labor_budget_hours,
      labor_budget_rate: t.labor_budget_rate,
      default_crew: t.default_crew as any,
    });
    if (error) { toast.error("Failed to create template"); return; }
    toast.success("Service template created");
    fetch();
  };

  const updateTemplate = async (id: string, t: Partial<Omit<JobTemplate, "id" | "user_id" | "created_at" | "updated_at">>) => {
    const update: any = { ...t, updated_at: new Date().toISOString() };
    if (t.default_crew) update.default_crew = t.default_crew;
    const { error } = await supabase.from("job_templates").update(update).eq("id", id);
    if (error) { toast.error("Failed to update template"); return; }
    toast.success("Template updated");
    fetch();
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("job_templates").delete().eq("id", id);
    if (error) { toast.error("Failed to delete template"); return; }
    toast.success("Template deleted");
    fetch();
  };

  return { templates, loading, createTemplate, updateTemplate, deleteTemplate, refetch: fetch };
}
