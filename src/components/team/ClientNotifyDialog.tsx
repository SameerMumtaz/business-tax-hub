import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, MessageSquare, Copy, Check, Send } from "lucide-react";

export interface AffectedClient {
  name: string;
  email?: string | null;
  phone?: string | null;
  jobs: { title: string; oldDate: string; newDate: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: AffectedClient[];
  actionType: "raincheck" | "rebalance";
}

export default function ClientNotifyDialog({ open, onOpenChange, clients, actionType }: Props) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const generateEmailBody = (client: AffectedClient) => {
    const jobList = client.jobs.map(j => `• ${j.title}: ${j.oldDate} → ${j.newDate}`).join("\n");
    return `Hi ${client.name},\n\nDue to ${actionType === "raincheck" ? "weather conditions" : "schedule optimization"}, the following service${client.jobs.length > 1 ? "s have" : " has"} been rescheduled:\n\n${jobList}\n\nWe apologize for any inconvenience. Please let us know if the new timing doesn't work for you.\n\nThank you for your understanding!`;
  };

  const generateSmsBody = (client: AffectedClient) => {
    const job = client.jobs[0];
    if (client.jobs.length === 1) {
      return `Hi ${client.name}, your ${job.title} has been rescheduled from ${job.oldDate} to ${job.newDate} due to ${actionType === "raincheck" ? "weather" : "schedule changes"}. Reply with any questions!`;
    }
    return `Hi ${client.name}, ${client.jobs.length} services have been rescheduled due to ${actionType === "raincheck" ? "weather" : "schedule changes"}. Please contact us for updated details.`;
  };

  const handleCopy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const clientsWithEmail = clients.filter(c => c.email);
  const clientsWithoutEmail = clients.filter(c => !c.email);

  if (clients.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Notify Clients
          </DialogTitle>
          <DialogDescription>
            {clients.length} client{clients.length !== 1 ? "s" : ""} affected. Email drafts and SMS templates ready below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {clientsWithEmail.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Email Drafts</span>
                <Badge variant="secondary" className="text-[10px]">{clientsWithEmail.length}</Badge>
              </div>
              {clientsWithEmail.map((client, i) => {
                const body = generateEmailBody(client);
                const subject = `Schedule Update — ${client.jobs.map(j => j.title).join(", ")}`;
                const mailto = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                return (
                  <div key={i} className="border rounded-lg p-3 mb-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm">{client.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{client.email}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleCopy(body, i)}>
                          {copiedIdx === i ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                          Copy
                        </Button>
                        <a href={mailto} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            <Mail className="h-3 w-3 mr-1" />Open email
                          </Button>
                        </a>
                      </div>
                    </div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded p-2 max-h-[100px] overflow-y-auto font-sans">{body}</pre>
                  </div>
                );
              })}
            </div>
          )}

          {clientsWithoutEmail.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">SMS / Text</span>
                <Badge variant="secondary" className="text-[10px]">{clientsWithoutEmail.length}</Badge>
              </div>
              {clientsWithoutEmail.map((client, i) => {
                const sms = generateSmsBody(client);
                const smsIdx = clientsWithEmail.length + i;
                const smsHref = client.phone ? `sms:${client.phone}?body=${encodeURIComponent(sms)}` : undefined;
                return (
                  <div key={i} className="border rounded-lg p-3 mb-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm">{client.name}</span>
                        {client.phone && <span className="text-xs text-muted-foreground ml-2">{client.phone}</span>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleCopy(sms, smsIdx)}>
                          {copiedIdx === smsIdx ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                          Copy
                        </Button>
                        {smsHref && (
                          <a href={smsHref}>
                            <Button variant="outline" size="sm" className="h-7 text-xs">
                              <MessageSquare className="h-3 w-3 mr-1" />Text
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded p-2 font-sans">{sms}</pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
