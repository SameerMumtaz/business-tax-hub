import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign } from "lucide-react";

interface JobBudgetFieldsProps {
  price: string;
  materialBudget: string;
  laborBudgetType: string;
  laborBudgetAmount: string;
  laborBudgetHours: string;
  laborBudgetRate: string;
  onPriceChange: (v: string) => void;
  onMaterialBudgetChange: (v: string) => void;
  onLaborBudgetTypeChange: (v: string) => void;
  onLaborBudgetAmountChange: (v: string) => void;
  onLaborBudgetHoursChange: (v: string) => void;
  onLaborBudgetRateChange: (v: string) => void;
}

export function getExpectedProfit(
  price: number,
  materialBudget: number,
  laborBudgetType: string,
  laborBudgetAmount: number,
  laborBudgetHours: number,
  laborBudgetRate: number,
) {
  const laborCost = laborBudgetType === "hours" ? laborBudgetHours * laborBudgetRate : laborBudgetAmount;
  const totalCost = materialBudget + laborCost;
  return { laborCost, totalCost, profit: price - totalCost, margin: price > 0 ? ((price - totalCost) / price) * 100 : 0 };
}

export default function JobBudgetFields({
  price, materialBudget, laborBudgetType, laborBudgetAmount, laborBudgetHours, laborBudgetRate,
  onPriceChange, onMaterialBudgetChange, onLaborBudgetTypeChange,
  onLaborBudgetAmountChange, onLaborBudgetHoursChange, onLaborBudgetRateChange,
}: JobBudgetFieldsProps) {
  const p = Number(price) || 0;
  const m = Number(materialBudget) || 0;
  const { laborCost, profit, margin } = getExpectedProfit(
    p, m, laborBudgetType, Number(laborBudgetAmount) || 0, Number(laborBudgetHours) || 0, Number(laborBudgetRate) || 0,
  );

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <DollarSign className="h-3.5 w-3.5" /> Pricing & Budget
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Job Price</Label>
        <Input type="number" min="0" step="0.01" placeholder="0.00" value={price} onChange={(e) => onPriceChange(e.target.value)} />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Material Budget</Label>
        <Input type="number" min="0" step="0.01" placeholder="0.00" value={materialBudget} onChange={(e) => onMaterialBudgetChange(e.target.value)} />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Labor Budget</Label>
        <Select value={laborBudgetType} onValueChange={onLaborBudgetTypeChange}>
          <SelectTrigger className="mb-2"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="amount">Flat Amount ($)</SelectItem>
            <SelectItem value="hours">Hours × Rate</SelectItem>
          </SelectContent>
        </Select>
        {laborBudgetType === "amount" ? (
          <Input type="number" min="0" step="0.01" placeholder="Labor cost $" value={laborBudgetAmount} onChange={(e) => onLaborBudgetAmountChange(e.target.value)} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Hours</Label>
              <Input type="number" min="0" step="0.5" placeholder="Hours" value={laborBudgetHours} onChange={(e) => onLaborBudgetHoursChange(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">$/hr</Label>
              <Input type="number" min="0" step="0.5" placeholder="Rate" value={laborBudgetRate} onChange={(e) => onLaborBudgetRateChange(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {p > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center rounded-md bg-muted/50 p-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Labor</p>
            <p className="text-xs font-mono font-medium">${laborCost.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Exp. Profit</p>
            <p className={`text-xs font-mono font-semibold ${profit >= 0 ? "text-chart-positive" : "text-destructive"}`}>
              ${profit.toFixed(0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Margin</p>
            <p className="text-xs font-mono font-medium">{margin.toFixed(1)}%</p>
          </div>
        </div>
      )}
    </div>
  );
}
