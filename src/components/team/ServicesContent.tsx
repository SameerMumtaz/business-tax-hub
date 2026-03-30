import { useState } from "react";
import { useJobTemplates, type JobTemplate } from "@/hooks/useJobTemplates";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import JobBudgetFields from "@/components/job/JobBudgetFields";
import { Plus, Pencil, Trash2, Briefcase, Clock, DollarSign, Users, Repeat } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export default function ServicesContent() {
  const { user } = useAuth();
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useJobTemplates();

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members-services", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("team_members")
        .select("id, name, pay_rate, worker_type")
        .eq("business_user_id", user.id)
        .in("status", ["active", "invited"]);
      return data || [];
    },
    enabled: !!user,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JobTemplate | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estHours, setEstHours] = useState("");
  const [price, setPrice] = useState("");
  const [materialBudget, setMaterialBudget] = useState("");
  const [laborType, setLaborType] = useState("amount");
  const [laborAmount, setLaborAmount] = useState("");
  const [laborHours, setLaborHours] = useState("");
  const [laborRate, setLaborRate] = useState("");
  const [selectedCrew, setSelectedCrew] = useState<{ worker_id: string; worker_name: string }[]>([]);
  const [recurrence, setRecurrence] = useState("");
  const resetForm = () => {
    setTitle(""); setDescription(""); setEstHours(""); setPrice("");
    setMaterialBudget(""); setLaborType("amount"); setLaborAmount("");
    setLaborHours(""); setLaborRate(""); setSelectedCrew([]); setRecurrence("");
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (t: JobTemplate) => {
    setEditing(t);
    setTitle(t.title);
    setDescription(t.description || "");
    setEstHours(t.estimated_hours ? String(t.estimated_hours) : "");
    setPrice(t.price ? String(t.price) : "");
    setMaterialBudget(t.material_budget ? String(t.material_budget) : "");
    setLaborType(t.labor_budget_type);
    setLaborAmount(t.labor_budget_amount ? String(t.labor_budget_amount) : "");
    setLaborHours(t.labor_budget_hours ? String(t.labor_budget_hours) : "");
    setLaborRate(t.labor_budget_rate ? String(t.labor_budget_rate) : "");
    setSelectedCrew(t.default_crew || []);
    setRecurrence(t.recurrence_interval || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const data = {
      title: title.trim(),
      description: description.trim() || null,
      estimated_hours: estHours ? Number(estHours) : null,
      price: Number(price) || 0,
      material_budget: Number(materialBudget) || 0,
      labor_budget_type: laborType,
      labor_budget_amount: Number(laborAmount) || 0,
      labor_budget_hours: Number(laborHours) || 0,
      labor_budget_rate: Number(laborRate) || 0,
      recurrence_interval: recurrence || null,
      default_crew: selectedCrew,
    };
    if (editing) {
      await updateTemplate(editing.id, data);
    } else {
      await createTemplate(data);
    }
    setDialogOpen(false);
    resetForm();
  };

  const toggleCrew = (member: { id: string; name: string }) => {
    setSelectedCrew((prev) => {
      const exists = prev.find((c) => c.worker_id === member.id);
      if (exists) return prev.filter((c) => c.worker_id !== member.id);
      return [...prev, { worker_id: member.id, worker_name: member.name }];
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Create reusable job templates for quick scheduling</p>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-2" />New Service</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Loading…</p>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 space-y-3">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">No service templates yet</p>
            <p className="text-xs text-muted-foreground">Create templates for your common jobs to speed up scheduling.</p>
            <Button variant="outline" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create First Template</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{t.title}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{t.title}"?</AlertDialogTitle>
                          <AlertDialogDescription>This won't affect existing jobs created from this template.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteTemplate(t.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2 text-xs">
                  {t.price > 0 && (
                    <Badge variant="secondary" className="gap-1">
                      <DollarSign className="h-3 w-3" />{formatCurrency(t.price)}
                    </Badge>
                  )}
                  {t.estimated_hours && (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />{t.estimated_hours}h
                    </Badge>
                  )}
                  {t.recurrence_interval && (
                    <Badge variant="secondary" className="gap-1">
                      <Repeat className="h-3 w-3" />{t.recurrence_interval}
                    </Badge>
                  )}
                  {t.default_crew.length > 0 && (
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />{t.default_crew.length} crew
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Service" : "New Service Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Service name *" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div>
              <label className="text-xs text-muted-foreground">Estimated Hours</label>
              <Input type="number" min="0.5" step="0.5" placeholder="e.g. 4" value={estHours} onChange={(e) => setEstHours(e.target.value)} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Recurrence</label>
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger>
                  <SelectValue placeholder="One-time (no recurrence)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One-time (no recurrence)</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="biannual">Bi-annual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <JobBudgetFields
              price={price} materialBudget={materialBudget}
              laborBudgetType={laborType} laborBudgetAmount={laborAmount}
              laborBudgetHours={laborHours} laborBudgetRate={laborRate}
              onPriceChange={setPrice} onMaterialBudgetChange={setMaterialBudget}
              onLaborBudgetTypeChange={setLaborType} onLaborBudgetAmountChange={setLaborAmount}
              onLaborBudgetHoursChange={setLaborHours} onLaborBudgetRateChange={setLaborRate}
            />

            {teamMembers.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Default Crew (optional)</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {teamMembers.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-2 py-1.5">
                      <Checkbox
                        checked={selectedCrew.some((c) => c.worker_id === m.id)}
                        onCheckedChange={() => toggleCrew(m)}
                      />
                      <span>{m.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{m.worker_type}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={!title.trim()}>
              {editing ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
