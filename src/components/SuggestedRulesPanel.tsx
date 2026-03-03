import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { detectPatterns, saveInferredRule, InferredPattern } from "@/lib/ruleInference";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Check, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface SuggestedRulesPanelProps {
  type: "expense" | "income";
  transactions: { id: string; vendor: string; category: string }[];
}

export default function SuggestedRulesPanel({ type, transactions }: SuggestedRulesPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inferredPatterns, setInferredPatterns] = useState<InferredPattern[]>([]);
  const [detecting, setDetecting] = useState(false);

  async function handleDetect() {
    if (!user) return;
    setDetecting(true);
    try {
      const patterns = await detectPatterns(transactions, type, user.id);
      setInferredPatterns(patterns);
      if (patterns.length === 0) {
        toast.info("No new patterns detected. Categorize more transactions to build patterns.");
      } else {
        toast.success(`Found ${patterns.length} pattern${patterns.length > 1 ? "s" : ""}`);
      }
    } catch {
      toast.error("Failed to detect patterns");
    } finally {
      setDetecting(false);
    }
  }

  async function handleAccept(pattern: InferredPattern) {
    if (!user) return;
    const { created, applied } = await saveInferredRule(pattern, user.id);
    if (created) {
      toast.success(`Rule created: "${pattern.keyword}" → ${pattern.category}${applied > 0 ? `. ${applied} auto-categorized.` : ""}`);
      setInferredPatterns(prev => prev.filter(p => p.keyword !== pattern.keyword));
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    }
  }

  function handleDismiss(keyword: string) {
    setInferredPatterns(prev => prev.filter(p => p.keyword !== keyword));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Suggested Rules</h2>
          <p className="text-sm text-muted-foreground">Detect patterns from your categorized {type === "expense" ? "expenses" : "sales"} and create rules automatically.</p>
        </div>
        <Button variant="outline" onClick={handleDetect} disabled={detecting}>
          <Lightbulb className="h-4 w-4 mr-2" />
          {detecting ? "Scanning…" : "Detect Patterns"}
        </Button>
      </div>

      {inferredPatterns.length > 0 && (
        <div className="space-y-2">
          {inferredPatterns.map((p) => (
            <div key={`${p.type}-${p.keyword}`} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium">"{p.keyword}"</span>
                  <span className="text-muted-foreground text-sm">→</span>
                  <Badge variant="secondary" className="text-xs">{p.category}</Badge>
                  <span className="text-xs text-muted-foreground">{p.count} transactions</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">e.g. {p.exampleVendors.join(", ")}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleAccept(p)}>
                  <Check className="h-3 w-3 mr-1" /> Accept
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleDismiss(p.keyword)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {inferredPatterns.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
          Click "Detect Patterns" to scan your transactions for repeated vendor→category mappings.
        </div>
      )}

      <div className="pt-2">
        <Link to="/categorization-rules" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ExternalLink className="h-3.5 w-3.5" /> Manage all categorization rules
        </Link>
      </div>
    </div>
  );
}
