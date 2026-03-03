import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useTimesheets } from "@/hooks/useTimesheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

export default function TimesheetsPage() {
  const { timesheets, entries, loading, createTimesheet, submitTimesheet } = useTimesheets();
  const [createOpen, setCreateOpen] = useState(false);
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");

  const handleCreate = async () => {
    if (!weekStart || !weekEnd) {
      toast.error("Both dates are required");
      return;
    }
    const result = await createTimesheet(weekStart, weekEnd);
    if (result) {
      setCreateOpen(false);
      setWeekStart("");
      setWeekEnd("");
    }
  };

  const getTimesheetEntries = (tsId: string) => entries.filter((e) => e.timesheet_id === tsId);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Timesheets</h1>
            <p className="text-sm text-muted-foreground">Track worker hours and payroll</p>
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

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading…</p>
        ) : timesheets.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 space-y-2">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">No timesheets yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {timesheets.map((ts) => {
              const tsEntries = getTimesheetEntries(ts.id);
              const totalPay = tsEntries.reduce((s, e) => s + e.total_pay, 0);
              const totalHours = tsEntries.reduce((s, e) => s + e.total_hours, 0);
              return (
                <Card key={ts.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {ts.week_start} — {ts.week_end}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={ts.status === "submitted" ? "default" : "secondary"}>
                          {ts.status}
                        </Badge>
                        {ts.status === "draft" && (
                          <Button size="sm" variant="outline" onClick={() => submitTimesheet(ts.id)}>
                            <Send className="h-3.5 w-3.5 mr-1" />Submit
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {tsEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No entries</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Worker</TableHead>
                            <TableHead className="text-right">Hours</TableHead>
                            <TableHead className="text-right">OT</TableHead>
                            <TableHead className="text-right">Pay</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tsEntries.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell className="font-medium">{e.worker_name}</TableCell>
                              <TableCell className="text-right">{e.total_hours}</TableCell>
                              <TableCell className="text-right">{e.overtime_hours}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(e.total_pay)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell className="font-semibold">Total</TableCell>
                            <TableCell className="text-right font-semibold">{totalHours}</TableCell>
                            <TableCell />
                            <TableCell className="text-right font-semibold font-mono">{formatCurrency(totalPay)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
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
