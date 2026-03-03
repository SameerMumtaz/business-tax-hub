import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AuditDismissal {
  transaction_id: string;
  issue_type: string;
}

export function useAuditDismissals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: dismissals = [], isLoading } = useQuery({
    queryKey: ["audit_dismissals", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("audit_dismissals")
        .select("transaction_id, issue_type")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data || []) as AuditDismissal[];
    },
    enabled: !!user,
  });

  const dismissedSet = new Set(
    dismissals.map((d) => `${d.transaction_id}::${d.issue_type}`)
  );

  const isDismissed = (transactionId: string, issueType: string) =>
    dismissedSet.has(`${transactionId}::${issueType}`);

  const dismiss = useMutation({
    mutationFn: async (items: { transactionId: string; issueType: string }[]) => {
      if (!user) return;
      const rows = items.map((item) => ({
        user_id: user.id,
        transaction_id: item.transactionId,
        issue_type: item.issueType,
      }));
      const { error } = await supabase
        .from("audit_dismissals")
        .upsert(rows, { onConflict: "user_id,transaction_id,issue_type", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit_dismissals", user?.id] });
    },
  });

  const undismiss = useMutation({
    mutationFn: async (items: { transactionId: string; issueType: string }[]) => {
      if (!user) return;
      for (const item of items) {
        const { error } = await supabase
          .from("audit_dismissals")
          .delete()
          .eq("user_id", user.id)
          .eq("transaction_id", item.transactionId)
          .eq("issue_type", item.issueType);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit_dismissals", user?.id] });
    },
  });

  return { dismissals, dismissedSet, isDismissed, dismiss, undismiss, isLoading };
}
