import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Clock, MapPin, Navigation, TrendingDown, Loader2, CheckCircle } from "lucide-react";
import type { OptimizedRoute } from "@/hooks/useRouteOptimization";
import { cn } from "@/lib/utils";

function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

interface RouteOptimizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: OptimizedRoute | null;
  loading: boolean;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  /** When true, shows approve/reject instead of submit */
  isManagerView?: boolean;
  onApprove?: () => Promise<void>;
  onReject?: () => Promise<void>;
  crewName?: string;
}

export default function RouteOptimizationDialog({
  open,
  onOpenChange,
  route,
  loading,
  onSubmit,
  submitting,
  isManagerView,
  onApprove,
  onReject,
  crewName,
}: RouteOptimizationDialogProps) {
  if (!route && !loading) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            {isManagerView ? "Route Optimization Request" : "Optimized Route"}
          </DialogTitle>
          <DialogDescription>
            {isManagerView
              ? `${crewName || "Crew member"} is requesting a route change`
              : "Review the optimized route before submitting for approval"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Calculating optimal route with real driving times...</p>
          </div>
        ) : route ? (
          <div className="space-y-4">
            {/* Savings summary */}
            {route.savingsMinutes > 0 && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 flex items-center gap-3">
                  <TrendingDown className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Save {route.savingsMinutes} min of travel time
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {route.totalOriginalMinutes} min → {route.totalOptimizedMinutes} min total drive time
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {route.savingsMinutes <= 0 && (
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="p-3 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Current route is already optimal!</p>
                    <p className="text-xs text-muted-foreground">No time savings from reordering</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Current vs Optimized */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Current Order</p>
                <div className="space-y-1.5">
                  {route.originalOrder.map((item, i) => (
                    <div key={`orig-${i}`} className="flex items-center gap-2 text-xs">
                      <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{item.title}</p>
                        <p className="truncate text-muted-foreground">{item.siteName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-primary mb-2 uppercase tracking-wider">Optimized Order</p>
                <div className="space-y-1.5">
                  {route.optimizedOrder.map((item, i) => (
                    <div key={`opt-${i}`} className="flex items-center gap-2 text-xs">
                      <span className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{item.title}</p>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{item.siteName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                            {formatTime12(item.suggestedTime)}
                          </Badge>
                          {item.travelMinutes > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {Math.round(item.travelMinutes)}m drive
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isManagerView ? "Close" : "Cancel"}
          </Button>
          {isManagerView ? (
            <>
              <Button variant="destructive" onClick={onReject} disabled={submitting}>
                Reject
              </Button>
              <Button onClick={onApprove} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Approve & Update Schedule
              </Button>
            </>
          ) : (
            route && route.savingsMinutes > 0 && (
              <Button onClick={onSubmit} disabled={submitting || loading}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Navigation className="h-4 w-4 mr-1" />}
                Send for Approval
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
