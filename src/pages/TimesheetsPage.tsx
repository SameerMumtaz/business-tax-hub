import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useTimesheets, type TimesheetEntry } from "@/hooks/useTimesheets";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Clock, Send, Trash2, RotateCcw, UserPlus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

interface Worker {
  id: string;
  name: string;
  type: "employee" | "contractor";
  pay_rate: number;
}

interface Job {
  id: string;
  title: string;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TimesheetsPage() {
  const { user } = useAuth();
  const {
    timesheets, entries, loading,
    createTimesheet, addEntry, updateEntry, deleteEntry,
    submitTimesheet, reopenTimesheet, deleteTimesheet,
  } = useTimesheets();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [addWorkerTsId, setAddWorkerTsId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [editingCell, setEditingCell] = useState<{ entryId: string; day: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Load employees, contractors, and jobs
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [empRes, conRes, jobRes] = await Promise.all([
        supabase.from("employees").select("id, name, salary").eq("user_id", user.id),
        supabase.from("contractors").select("id, name, pay_rate").eq("user_id", user.id),
        supabase.from("jobs").select("id, title").eq("user_id", user.id).in("status", ["scheduled", "in_progress"]),
      ]);
      const w: Worker[] = [];
      (empRes.data || []).forEach((e: any) =>
        w.push({ id: e.id, name: e.name, type: "employee", pay_rate: e.salary ? e.salary / 2080 : 0 })
      );
      (conRes.data || []).forEach((c: any) =>
        w.push({ id: c.id, name: c.name, type: "contractor", pay_rate: c.pay_rate || 0 })
      );
      setWorkers(w);
      setJobs((jobRes.data || []) as Job[]);
    };
    load();
  }, [user]);

  const handleCreate = async () => {
    if (!weekStart || !weekEnd) { toast.error("Both dates required"); return; }
    const result = await createTimesheet(weekStart, weekEnd);
    if (result) { setCreateOpen(false); setWeekStart(""); setWeekEnd(""); }
  };

  const handleAddWorker = async () => {
    if (!addWorkerTsId || !selectedWorkerId) { toast.error("Select a worker"); return; }
    const worker = workers.find((w) => w.id === selectedWorkerId);
    if (!worker) return;

    // Check if already added
    const alreadyExists = entries.some(
      (e) => e.timesheet_id === addWorkerTsId && e.worker_id === worker.id
    );
    if (alreadyExists) { toast.error("Worker already on this timesheet"); return; }

    await addEntry({
      timesheet_id: addWorkerTsId,
      worker_id: worker.id,
      worker_name: worker.name,
      worker_type: worker.type,
      pay_rate: worker.pay_rate,
      mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0,
      fri_hours: 0, sat_hours: 0, sun_hours: 0,
      job_id: selectedJobId || null,
    });
    setAddWorkerTsId(null);
    setSelectedWorkerId("");
    setSelectedJobId("");
  };

  const handleCellClick = (entryId: string, day: string, currentValue: number) => {
    setEditingCell({ entryId, day });
    setEditValue(currentValue.toString());
  };

  const handleCellBlur = async () => {
    if (!editingCell) return;
    const val = parseFloat(editValue) || 0;
    const key = `${editingCell.day}_hours` as keyof TimesheetEntry;
    await updateEntry(editingCell.entryId, { [key]: val } as any);
    setEditingCell(null);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCellBlur();
    if (e.key === "Escape") setEditingCell(null);
  };

  const handleJobChange = async (entryId: string, jobId: string) => {
    await updateEntry(entryId, { job_id: jobId || null } as any);
  };

  const getTimesheetEntries = (tsId: string) => entries.filter((e) => e.timesheet_id === tsId);

  const workerMap = new Map(workers.map((w) => [w.id, w]));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Timesheets</h1>
            <p className="text-sm text-muted-foreground">
              Track weekly hours, assign workers to jobs, and calculate payroll
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Timesheet</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Timesheet</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-muted-foreground">Week Start</label>
                    <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Week End</label>
                    <Input type="date" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleCreate}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Add Worker Dialog */}
        <Dialog open={!!addWorkerTsId} onOpenChange={(open) => { if (!open) setAddWorkerTsId(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Worker to Timesheet</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-sm text-muted-foreground">Worker</label>
                <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                  <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                  <SelectContent>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} <span className="text-muted-foreground">({w.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Assign to Job (optional)</label>
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger><SelectValue placeholder="No job assigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No job</SelectItem>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedWorkerId && (
                <p className="text-xs text-muted-foreground">
                  Pay rate: {formatCurrency(workerMap.get(selectedWorkerId)?.pay_rate || 0)}/hr
                </p>
              )}
              <Button className="w-full" onClick={handleAddWorker}>Add Worker</Button>
            </div>
          </DialogContent>
        </Dialog>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading…</p>
        ) : timesheets.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 space-y-2">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">No timesheets yet</p>
              <p className="text-sm text-muted-foreground">
                Create one and add your employees and contractors
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {timesheets.map((ts) => {
              const tsEntries = getTimesheetEntries(ts.id);
              const totalPay = tsEntries.reduce((s, e) => s + e.total_pay, 0);
              const totalHours = tsEntries.reduce((s, e) => s + e.total_hours, 0);
              const isDraft = ts.status === "draft";

              return (
                <Card key={ts.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-base">
                          {ts.week_start} — {ts.week_end}
                        </CardTitle>
                        <Badge variant={ts.status === "submitted" ? "default" : "secondary"}>
                          {ts.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {isDraft && (
                          <Button size="sm" variant="outline" onClick={() => setAddWorkerTsId(ts.id)}>
                            <UserPlus className="h-3.5 w-3.5 mr-1" />Add Worker
                          </Button>
                        )}
                        {isDraft && (
                          <Button size="sm" variant="outline" onClick={() => submitTimesheet(ts.id)}>
                            <Send className="h-3.5 w-3.5 mr-1" />Submit
                          </Button>
                        )}
                        {ts.status === "submitted" && (
                          <Button size="sm" variant="outline" onClick={() => reopenTimesheet(ts.id)}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />Reopen
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Timesheet?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this timesheet and all its entries.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteTimesheet(ts.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {tsEntries.length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <p className="text-sm text-muted-foreground">No workers added yet</p>
                        {isDraft && (
                          <Button size="sm" variant="outline" onClick={() => setAddWorkerTsId(ts.id)}>
                            <UserPlus className="h-3.5 w-3.5 mr-1" />Add Worker
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[140px]">Worker</TableHead>
                              <TableHead className="min-w-[120px]">Job</TableHead>
                              <TableHead className="text-right">Rate</TableHead>
                              {DAY_LABELS.map((d) => (
                                <TableHead key={d} className="text-center w-16">{d}</TableHead>
                              ))}
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-right">OT</TableHead>
                              <TableHead className="text-right">Pay</TableHead>
                              {isDraft && <TableHead className="w-10" />}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tsEntries.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell>
                                  <div>
                                    <span className="font-medium">{entry.worker_name}</span>
                                    <Badge variant="outline" className="ml-2 text-[10px]">
                                      {entry.worker_type}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {isDraft ? (
                                    <Select
                                      value={entry.job_id || ""}
                                      onValueChange={(v) => handleJobChange(entry.id, v)}
                                    >
                                      <SelectTrigger className="h-7 text-xs w-28">
                                        <SelectValue placeholder="None" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="">None</SelectItem>
                                        {jobs.map((j) => (
                                          <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      {entry.job_id ? jobs.find((j) => j.id === entry.job_id)?.title || "—" : "—"}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                  ${entry.pay_rate.toFixed(2)}
                                </TableCell>
                                {DAYS.map((day) => {
                                  const key = `${day}_hours` as keyof TimesheetEntry;
                                  const val = entry[key] as number;
                                  const isEditing =
                                    editingCell?.entryId === entry.id && editingCell?.day === day;

                                  return (
                                    <TableCell key={day} className="text-center p-1">
                                      {isDraft ? (
                                        isEditing ? (
                                          <Input
                                            type="number"
                                            min="0"
                                            max="24"
                                            step="0.5"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={handleCellBlur}
                                            onKeyDown={handleCellKeyDown}
                                            className="h-7 w-14 text-center text-xs p-1"
                                            autoFocus
                                          />
                                        ) : (
                                          <button
                                            onClick={() => handleCellClick(entry.id, day, val)}
                                            className="w-14 h-7 rounded border border-transparent hover:border-border text-xs font-mono transition-colors"
                                          >
                                            {val || "–"}
                                          </button>
                                        )
                                      ) : (
                                        <span className="text-xs font-mono">{val || "–"}</span>
                                      )}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-right font-semibold font-mono text-sm">
                                  {entry.total_hours}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                  {entry.overtime_hours > 0 ? entry.overtime_hours : "–"}
                                </TableCell>
                                <TableCell className="text-right font-mono font-medium">
                                  {formatCurrency(entry.total_pay)}
                                </TableCell>
                                {isDraft && (
                                  <TableCell>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => deleteEntry(entry.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                            <TableRow className="border-t-2">
                              <TableCell colSpan={3} className="font-semibold">Totals</TableCell>
                              {DAYS.map((day) => {
                                const dayTotal = tsEntries.reduce(
                                  (s, e) => s + (e[`${day}_hours` as keyof TimesheetEntry] as number),
                                  0
                                );
                                return (
                                  <TableCell key={day} className="text-center font-mono text-xs font-semibold">
                                    {dayTotal || "–"}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-right font-bold font-mono">
                                {totalHours}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {tsEntries.reduce((s, e) => s + e.overtime_hours, 0) || "–"}
                              </TableCell>
                              <TableCell className="text-right font-bold font-mono">
                                {formatCurrency(totalPay)}
                              </TableCell>
                              {isDraft && <TableCell />}
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
