import { useState } from "react";
import { type Job, type JobAssignment } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, X, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  name: string;
  pay_rate: number | null;
  worker_type: string;
}

interface CrewAssignmentPanelProps {
  job: Job;
  assignments: JobAssignment[];
  teamMembers: TeamMember[];
  onAssign: (workerId: string, workerName: string, workerType: string, hours: number) => void;
  onRemove: (assignmentId: string) => void;
}

export default function CrewAssignmentPanel({
  job, assignments, teamMembers, onAssign, onRemove,
}: CrewAssignmentPanelProps) {
  const [adding, setAdding] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState("");
  const [hours, setHours] = useState("");

  const jobAssignments = assignments.filter((a) => a.job_id === job.id);
  const assignedWorkerIds = new Set(jobAssignments.map((a) => a.worker_id));
  const availableWorkers = teamMembers.filter((m) => !assignedWorkerIds.has(m.id));

  const totalAssignedHours = jobAssignments.reduce((s, a) => s + (a.assigned_hours || 0), 0);
  const laborBudgetHrs = job.labor_budget_type === "hours"
    ? job.labor_budget_hours
    : (job.labor_budget_amount > 0 ? job.labor_budget_amount : 0); // for amount type, we track dollars
  const isHoursMode = job.labor_budget_type === "hours";

  // For dollar-based budgets, compute assigned dollar cost
  const assignedDollars = jobAssignments.reduce((s, a) => {
    const member = teamMembers.find((m) => m.id === a.worker_id);
    const rate = member?.pay_rate || 0;
    return s + (a.assigned_hours || 0) * rate;
  }, 0);

  const budgetDollars = isHoursMode
    ? job.labor_budget_hours * job.labor_budget_rate
    : job.labor_budget_amount;

  const remainingHrs = isHoursMode ? laborBudgetHrs - totalAssignedHours : 0;
  const remainingDollars = budgetDollars - assignedDollars;
  const isOverBudget = isHoursMode ? totalAssignedHours > laborBudgetHrs && laborBudgetHrs > 0 : assignedDollars > budgetDollars && budgetDollars > 0;
  const hasBudget = budgetDollars > 0 || laborBudgetHrs > 0;

  const handleAssign = () => {
    const worker = teamMembers.find((m) => m.id === selectedWorker);
    if (!worker || !hours) return;
    onAssign(worker.id, worker.name, worker.worker_type, Number(hours));
    setAdding(false);
    setSelectedWorker("");
    setHours("");
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-3.5 w-3.5" /> Crew Assignments
        </div>
        {hasBudget && (
          <Badge variant={isOverBudget ? "destructive" : "secondary"} className="text-[10px] gap-1">
            {isOverBudget && <AlertTriangle className="h-3 w-3" />}
            {isHoursMode
              ? `${totalAssignedHours}/${laborBudgetHrs} hrs`
              : `$${assignedDollars.toFixed(0)}/$${budgetDollars.toFixed(0)}`}
          </Badge>
        )}
      </div>

      {/* Budget summary */}
      {hasBudget && (
        <div className="grid grid-cols-3 gap-2 text-center rounded-md bg-muted/50 p-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Budget</p>
            <p className="text-xs font-mono font-medium">
              {isHoursMode ? `${laborBudgetHrs}h · $${budgetDollars.toFixed(0)}` : `$${budgetDollars.toFixed(0)}`}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Assigned</p>
            <p className="text-xs font-mono font-medium">
              {totalAssignedHours}h · ${assignedDollars.toFixed(0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Remaining</p>
            <p className={cn("text-xs font-mono font-semibold", isOverBudget ? "text-destructive" : "text-chart-positive")}>
              {isHoursMode ? `${remainingHrs}h` : `$${remainingDollars.toFixed(0)}`}
            </p>
          </div>
        </div>
      )}

      {/* Current assignments */}
      {jobAssignments.length > 0 ? (
        <div className="space-y-1.5">
          {jobAssignments.map((a) => {
            const member = teamMembers.find((m) => m.id === a.worker_id);
            const rate = member?.pay_rate || 0;
            const cost = (a.assigned_hours || 0) * rate;
            return (
              <div key={a.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{a.worker_name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{a.worker_type}</Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {a.assigned_hours}h
                    {rate > 0 && ` · $${cost.toFixed(0)}`}
                  </span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRemove(a.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">No crew assigned yet</p>
      )}

      {/* Add worker */}
      {adding ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <Select value={selectedWorker} onValueChange={setSelectedWorker}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select worker" />
            </SelectTrigger>
            <SelectContent>
              {availableWorkers.length === 0 ? (
                <SelectItem value="__none" disabled>No available workers</SelectItem>
              ) : (
                availableWorkers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.worker_type}){m.pay_rate ? ` · $${m.pay_rate}/hr` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              type="number" min="0.5" step="0.5" placeholder="Hours"
              className="h-8 text-xs" value={hours} onChange={(e) => setHours(e.target.value)}
            />
            <Button size="sm" className="h-8 text-xs" onClick={handleAssign} disabled={!selectedWorker || !hours}>
              Assign
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          {/* Over-budget warning */}
          {selectedWorker && hours && hasBudget && (() => {
            const worker = teamMembers.find((m) => m.id === selectedWorker);
            const newHrs = totalAssignedHours + Number(hours);
            const newCost = assignedDollars + Number(hours) * (worker?.pay_rate || 0);
            const wouldExceed = isHoursMode ? newHrs > laborBudgetHrs : newCost > budgetDollars;
            if (wouldExceed) {
              return (
                <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  This assignment would exceed the labor budget
                </div>
              );
            }
            return null;
          })()}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3 mr-1" /> Assign Worker
        </Button>
      )}
    </div>
  );
}
