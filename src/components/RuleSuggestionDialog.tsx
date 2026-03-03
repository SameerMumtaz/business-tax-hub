import { useState } from "react";
import { RuleSuggestion, applyRuleSuggestion } from "@/lib/ruleInference";
import { formatCurrency } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Check } from "lucide-react";
import { toast } from "sonner";

interface RuleSuggestionDialogProps {
  suggestion: RuleSuggestion | null;
  onClose: () => void;
  onApplied: () => void;
}

export default function RuleSuggestionDialog({ suggestion, onClose, onApplied }: RuleSuggestionDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  if (!suggestion) return null;

  const allSelected = selectedIds.size === suggestion.matchingTransactions.length;

  const handleOpen = (open: boolean) => {
    if (!open) {
      onClose();
      setSelectedIds(new Set());
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestion.matchingTransactions.map(t => t.id)));
    }
  };

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const { success, applied } = await applyRuleSuggestion(suggestion, [...selectedIds]);
      if (success) {
        toast.success(
          applied > 0
            ? `✨ Rule created: "${suggestion.keyword}" → ${suggestion.category}. ${applied} transaction${applied !== 1 ? "s" : ""} updated.`
            : `Rule created: "${suggestion.keyword}" → ${suggestion.category}`
        );
        onApplied();
        onClose();
        setSelectedIds(new Set());
      } else {
        toast.error("Failed to create rule");
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={!!suggestion} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Pattern Detected
          </DialogTitle>
          <DialogDescription>
            {suggestion.evidenceCount} categorized transactions match{" "}
            <span className="font-mono font-medium text-foreground">"{suggestion.keyword}"</span>
            {" → "}
            <Badge variant="secondary" className="text-xs">{suggestion.category}</Badge>.
            {" "}Select which uncategorized transactions should also be updated.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-lg">
          <div className="sticky top-0 bg-muted/80 backdrop-blur px-3 py-2 border-b flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-xs font-medium text-muted-foreground cursor-pointer">
              {allSelected ? "Deselect all" : "Select all"} ({suggestion.matchingTransactions.length} transaction{suggestion.matchingTransactions.length !== 1 ? "s" : ""})
            </label>
          </div>
          <div className="divide-y">
            {suggestion.matchingTransactions.map(t => (
              <label
                key={t.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selectedIds.has(t.id)}
                  onCheckedChange={() => toggle(t.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.vendor}</p>
                  {t.description && (
                    <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {t.amount != null && (
                    <p className="text-sm font-medium">{formatCurrency(t.amount)}</p>
                  )}
                  {t.date && (
                    <p className="text-xs text-muted-foreground">{t.date}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => handleOpen(false)} disabled={applying}>
            Dismiss
          </Button>
          <Button onClick={handleApply} disabled={applying}>
            <Check className="h-4 w-4 mr-1" />
            {applying
              ? "Applying…"
              : selectedIds.size > 0
                ? `Create Rule & Update ${selectedIds.size} Transaction${selectedIds.size !== 1 ? "s" : ""}`
                : "Create Rule Only"
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
