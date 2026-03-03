import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, Building2, Tag, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";

const STEPS = [
  {
    icon: Building2,
    title: "Set up your business profile",
    description: "Add your business name and address. This info appears on invoices and tax forms.",
    actionLabel: "Set Up Profile",
    path: "/profile",
    checkKey: "profile",
  },
  {
    icon: Upload,
    title: "Import your transactions",
    description: "Upload a bank statement (CSV or PDF). Bookie will automatically separate income from expenses.",
    actionLabel: "Import Transactions",
    path: "/import",
    checkKey: "import",
  },
  {
    icon: Tag,
    title: "Review your categories",
    description: "Bookie auto-categorizes most expenses. Review them to maximize your tax deductions.",
    actionLabel: "Review Categories",
    path: "/expenses",
    checkKey: "categorize",
  },
] as const;

interface OnboardingWizardProps {
  completedSteps: Set<string>;
  onDismiss: () => void;
}

export default function OnboardingWizard({ completedSteps, onDismiss }: OnboardingWizardProps) {
  const navigate = useNavigate();
  const totalSteps = STEPS.length;
  const completed = STEPS.filter((s) => completedSteps.has(s.checkKey)).length;
  const progress = (completed / totalSteps) * 100;

  if (completed >= totalSteps) {
    return (
      <Card className="border-accent bg-accent/5">
        <CardContent className="py-6 flex items-center gap-4">
          <div className="rounded-full bg-accent p-3">
            <Sparkles className="h-6 w-6 text-chart-positive" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">You're all set!</h3>
            <p className="text-sm text-muted-foreground">Your Bookie account is ready. Explore the dashboard to see your financial overview.</p>
          </div>
          <Button variant="outline" size="sm" onClick={onDismiss}>Dismiss</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Getting Started
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {completed} of {totalSteps} steps complete
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onDismiss}>
            Skip setup
          </Button>
        </div>

        <Progress value={progress} className="h-2" />

        <div className="space-y-3">
          {STEPS.map((step) => {
            const done = completedSteps.has(step.checkKey);
            return (
              <div
                key={step.checkKey}
                className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
                  done ? "bg-muted/50 opacity-60" : "hover:bg-accent/5 cursor-pointer"
                }`}
                onClick={() => !done && navigate(step.path)}
              >
                <div className={`rounded-full p-2 shrink-0 ${done ? "bg-accent" : "bg-primary/10"}`}>
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-chart-positive" />
                  ) : (
                    <step.icon className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? "line-through" : ""}`}>{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
                {!done && (
                  <Button variant="outline" size="sm" className="shrink-0" onClick={(e) => { e.stopPropagation(); navigate(step.path); }}>
                    {step.actionLabel}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
