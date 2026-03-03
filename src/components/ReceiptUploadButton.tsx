import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Paperclip, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  expenseId: string;
  receiptUrl?: string | null;
  userId?: string;
}

export default function ReceiptUploadButton({ expenseId, receiptUrl, userId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    const ext = file.name.split(".").pop();
    const path = `${userId}/${expenseId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, file, { upsert: true });
    if (uploadError) { toast.error("Upload failed"); return; }
    const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
    await supabase.from("expenses").update({ receipt_url: urlData.publicUrl }).eq("id", expenseId);
    qc.invalidateQueries({ queryKey: ["expenses"] });
    toast.success("Receipt attached");
  };

  if (receiptUrl) {
    return (
      <Button variant="ghost" size="icon" asChild>
        <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5 text-chart-positive" />
        </a>
      </Button>
    );
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
      <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()}>
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </>
  );
}
