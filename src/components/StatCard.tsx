import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  trend?: string;
  variant?: "default" | "positive" | "negative";
}

export default function StatCard({ title, value, icon: Icon, trend, variant = "default" }: StatCardProps) {
  const colorClass =
    variant === "positive"
      ? "text-chart-positive"
      : variant === "negative"
      ? "text-chart-negative"
      : "text-foreground";

  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className={`text-lg sm:text-2xl font-semibold font-mono tracking-tight ${colorClass}`}>
        {formatCurrency(value)}
      </p>
      {trend && (
        <p className="text-xs text-muted-foreground mt-1">{trend}</p>
      )}
    </div>
  );
}
