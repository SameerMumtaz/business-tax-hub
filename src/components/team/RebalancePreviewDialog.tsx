import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Scale, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RebalancePlan {
  moves: { jobId: string; title: string; fromDate: string; toDate: string; hours: number }[];
  dayHoursBefore: { dateStr: string; dayLabel: string; hours: number }[];
  dayHoursAfter: { dateStr: string; dayLabel: string; hours: number }[];
  targetMax: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: RebalancePlan | null;
  loading: boolean;
  onConfirm: () => void;
}

export default function RebalancePreviewDialog({ open, onOpenChange, plan, loading, onConfirm }: Props) {
  if (!plan) return null;

  const maxHours = Math.max(
    ...plan.dayHoursBefore.map(d => d.hours),
    ...plan.dayHoursAfter.map(d => d.hours),
    plan.targetMax,
    1
  );

  const getBarColor = (hours: number, targetMax: number) => {
    if (hours > targetMax) return "bg-destructive";
    if (hours > targetMax * 0.8) return "bg-amber-500";
    return "bg-primary";
  };

  const getAfterBarColor = (hours: number, targetMax: number) => {
    if (hours > targetMax) return "bg-destructive";
    if (hours > targetMax * 0.8) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Rebalance Preview
          </DialogTitle>
          <DialogDescription>
            {plan.moves.length} job{plan.moves.length !== 1 ? "s" : ""} will be redistributed across the week.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Before / After comparison */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2.5 uppercase tracking-wider">Before</p>
              <div className="space-y-2">
                {plan.dayHoursBefore.map(d => (
                  <div key={d.dateStr} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium w-8 text-right text-muted-foreground">{d.dayLabel}</span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className={cn("h-full rounded-full transition-all", getBarColor(d.hours, plan.targetMax))}
                        style={{ width: `${Math.max(2, (d.hours / maxHours) * 100)}%` }}
                      />
                    </div>
                    <span className={cn("text-[11px] font-mono w-10 text-right", d.hours > plan.targetMax ? "text-destructive font-bold" : "text-muted-foreground")}>{d.hours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2.5 uppercase tracking-wider">After</p>
              <div className="space-y-2">
                {plan.dayHoursAfter.map(d => (
                  <div key={d.dateStr} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium w-8 text-right text-muted-foreground">{d.dayLabel}</span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className={cn("h-full rounded-full transition-all", getAfterBarColor(d.hours, plan.targetMax))}
                        style={{ width: `${Math.max(2, (d.hours / maxHours) * 100)}%` }}
                      />
                    </div>
                    <span className={cn("text-[11px] font-mono w-10 text-right", d.hours > plan.targetMax ? "text-destructive font-bold" : "text-emerald-600 dark:text-emerald-400")}>{d.hours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Target line label */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="h-px flex-1 border-t border-dashed border-muted-foreground/30" />
            <span>Target max: {plan.targetMax.toFixed(1)}h / day</span>
            <div className="h-px flex-1 border-t border-dashed border-muted-foreground/30" />
          </div>

          {/* Move details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Changes</p>
            <div className="max-h-[150px] overflow-y-auto space-y-1">
              {plan.moves.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded bg-muted/50">
                  <span className="font-medium truncate flex-1">{m.title}</span>
                  <span className="text-[11px] font-mono text-muted-foreground">{m.hours}h</span>
                  <span className="text-xs text-muted-foreground">{m.fromDate}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-primary">{m.toDate}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={onConfirm} disabled={loading}>
            <Scale className="h-4 w-4 mr-2" />
            {loading ? "Rebalancing…" : `Apply ${plan.moves.length} changes`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
