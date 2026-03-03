import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Shield, Users, DollarSign, History } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  accepted_at: string | null;
  worker_type: string;
  pay_rate: number;
}

interface PayRateChange {
  id: string;
  team_member_id: string;
  previous_rate: number;
  new_rate: number;
  effective_date: string;
  reason: string | null;
  created_at: string;
}

export default function MembersContent() {
  const { user } = useAuth();
  const { role: currentRole } = useTeamRole();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("crew");
  const [inviteWorkerType, setInviteWorkerType] = useState<string>("1099");
  const [invitePayRate, setInvitePayRate] = useState("");
  const [inviteAddress, setInviteAddress] = useState("");
  const [inviteState, setInviteState] = useState("");
  const [sending, setSending] = useState(false);

  // Pay rate change state
  const [rateChangeOpen, setRateChangeOpen] = useState(false);
  const [rateChangeMember, setRateChangeMember] = useState<TeamMember | null>(null);
  const [newRate, setNewRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [rateChangeReason, setRateChangeReason] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // Rate history
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMember, setHistoryMember] = useState<TeamMember | null>(null);
  const [rateHistory, setRateHistory] = useState<PayRateChange[]>([]);

  const fetchMembers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("business_user_id", user.id)
      .order("created_at", { ascending: false });
    setMembers((data || []) as TeamMember[]);
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, [user]);

  const handleInvite = async () => {
    if (!user || !inviteName.trim() || !inviteEmail.trim()) {
      toast.error("Name and email are required"); return;
    }
    setSending(true);
    try {
      const res = await supabase.functions.invoke("invite-crew", {
        body: {
          email: inviteEmail.trim(), name: inviteName.trim(), role: inviteRole,
          business_user_id: user.id, worker_type: inviteWorkerType,
          pay_rate: parseFloat(invitePayRate) || 0,
          address: inviteAddress.trim() || null,
          state_employed: inviteState.trim() || null,
        },
      });
      if (res.error) throw res.error;
      const resData = res.data as any;
      if (resData?.error) { toast.error(resData.error); return; }
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false); setInviteName(""); setInviteEmail(""); setInviteRole("crew");
      setInviteWorkerType("1099"); setInvitePayRate(""); setInviteAddress(""); setInviteState("");
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally { setSending(false); }
  };

  const handleDeactivate = async (id: string) => {
    await supabase.from("team_members").update({ status: "deactivated" }).eq("id", id);
    toast.success("Member deactivated"); fetchMembers();
  };
  const handleReactivate = async (id: string) => {
    await supabase.from("team_members").update({ status: "active" }).eq("id", id);
    toast.success("Member reactivated"); fetchMembers();
  };

  const openRateChange = (member: TeamMember) => {
    setRateChangeMember(member);
    setNewRate("");
    setEffectiveDate(new Date().toISOString().split("T")[0]);
    setRateChangeReason("");
    setRateChangeOpen(true);
  };

  const handleRateChange = async () => {
    if (!user || !rateChangeMember || !newRate) {
      toast.error("New rate is required"); return;
    }
    const newRateNum = parseFloat(newRate);
    if (isNaN(newRateNum) || newRateNum < 0) {
      toast.error("Invalid rate"); return;
    }
    if (!effectiveDate) {
      toast.error("Effective date is required"); return;
    }
    setSavingRate(true);
    try {
      // Record the change in history
      const { error: historyError } = await supabase.from("pay_rate_changes").insert({
        team_member_id: rateChangeMember.id,
        previous_rate: rateChangeMember.pay_rate,
        new_rate: newRateNum,
        effective_date: effectiveDate,
        reason: rateChangeReason.trim() || null,
        user_id: user.id,
      });
      if (historyError) throw historyError;

      // Check if effective today or in the past — update current rate immediately
      const today = new Date().toISOString().split("T")[0];
      if (effectiveDate <= today) {
        await supabase.from("team_members")
          .update({ pay_rate: newRateNum })
          .eq("id", rateChangeMember.id);

        // Also update the corresponding contractor/employee record
        if (rateChangeMember.worker_type === "1099") {
          await supabase.from("contractors")
            .update({ pay_rate: newRateNum })
            .eq("user_id", user.id)
            .eq("name", rateChangeMember.name);
        } else {
          await supabase.from("employees")
            .update({ salary: newRateNum })
            .eq("user_id", user.id)
            .eq("name", rateChangeMember.name);
        }
        toast.success(`Pay rate updated to ${formatCurrency(newRateNum)} effective ${effectiveDate}`);
      } else {
        toast.success(`Pay rate change scheduled for ${effectiveDate}. Current rate unchanged until then.`);
      }

      setRateChangeOpen(false);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to update rate");
    } finally { setSavingRate(false); }
  };

  const openHistory = async (member: TeamMember) => {
    setHistoryMember(member);
    setHistoryOpen(true);
    const { data } = await supabase
      .from("pay_rate_changes")
      .select("*")
      .eq("team_member_id", member.id)
      .order("effective_date", { ascending: false });
    setRateHistory((data || []) as PayRateChange[]);
  };

  const roleBadgeColor = (role: string) => role === "admin" ? "default" : role === "manager" ? "secondary" : "outline";
  const statusBadgeVariant = (status: string) =>
    status === "active" ? "default" as const : status === "invited" ? "secondary" as const : "destructive" as const;
  const canInviteRole = currentRole === "admin" ? ["manager", "crew"] : ["crew"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 mr-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Members</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{members.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {members.filter((m) => m.status === "active").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Invites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">
                {members.filter((m) => m.status === "invited").length}
              </div>
            </CardContent>
          </Card>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" />Invite Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <Input placeholder="Full name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
              <Input type="email" placeholder="Email address" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {canInviteRole.map((r) => (
                    <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={inviteWorkerType} onValueChange={setInviteWorkerType}>
                <SelectTrigger><SelectValue placeholder="Worker type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1099">1099 Contractor</SelectItem>
                  <SelectItem value="W2">W-2 Salaried</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number" step="0.01" min="0"
                placeholder={inviteWorkerType === "1099" ? "Hourly pay rate ($)" : "Annual salary ($)"}
                value={invitePayRate} onChange={(e) => setInvitePayRate(e.target.value)}
              />
              <Input placeholder="Address (optional)" value={inviteAddress} onChange={(e) => setInviteAddress(e.target.value)} />
              <Input placeholder="State employed (optional)" value={inviteState} onChange={(e) => setInviteState(e.target.value)} />
              <Button className="w-full" onClick={handleInvite} disabled={sending}>
                {sending ? "Sending…" : "Send Invitation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pay Rate Change Dialog */}
      <Dialog open={rateChangeOpen} onOpenChange={setRateChangeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Pay Rate — {rateChangeMember?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-md bg-muted p-3 text-sm">
              <span className="text-muted-foreground">Current rate: </span>
              <span className="font-semibold font-mono">
                {rateChangeMember?.worker_type === "W2"
                  ? `${formatCurrency(rateChangeMember?.pay_rate || 0)}/yr`
                  : `${formatCurrency(rateChangeMember?.pay_rate || 0)}/hr`}
              </span>
            </div>
            <div>
              <label className="text-sm font-medium">New Rate</label>
              <Input
                type="number" step="0.01" min="0"
                placeholder={rateChangeMember?.worker_type === "1099" ? "New hourly rate ($)" : "New annual salary ($)"}
                value={newRate} onChange={(e) => setNewRate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Effective Date</label>
              <Input
                type="date" value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Set to today to apply immediately, or a future date to schedule the change.
                Future changes won't affect current rate until that date.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                placeholder="e.g. Annual raise, promotion, market adjustment…"
                value={rateChangeReason} onChange={(e) => setRateChangeReason(e.target.value)}
                rows={2}
              />
            </div>
            <Button className="w-full" onClick={handleRateChange} disabled={savingRate}>
              {savingRate ? "Saving…" : effectiveDate <= new Date().toISOString().split("T")[0]
                ? "Update Rate Now"
                : `Schedule Change for ${effectiveDate}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rate History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pay Rate History — {historyMember?.name}</DialogTitle>
          </DialogHeader>
          <div className="pt-2">
            {rateHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No rate changes recorded yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Effective Date</TableHead>
                    <TableHead className="text-right">Previous</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateHistory.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.effective_date}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {formatCurrency(r.previous_rate)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatCurrency(r.new_rate)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                        {r.reason || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Loading…</p>
          ) : members.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">No team members yet</p>
              <p className="text-sm text-muted-foreground">Invite managers and crew members to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Pay Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeColor(m.role) as any}>
                        <Shield className="h-3 w-3 mr-1" />{m.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.worker_type === "W2" ? "secondary" : "outline"}>
                        {m.worker_type === "W2" ? "W-2 Salaried" : "1099 Contractor"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {m.worker_type === "W2"
                        ? `$${(m.pay_rate || 0).toLocaleString()}/yr`
                        : `$${(m.pay_rate || 0).toFixed(2)}/hr`}
                    </TableCell>
                    <TableCell><Badge variant={statusBadgeVariant(m.status)}>{m.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.invited_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => openRateChange(m)} title="Change pay rate">
                        <DollarSign className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openHistory(m)} title="Rate history">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      {m.status === "active" && (
                        <Button size="sm" variant="ghost" onClick={() => handleDeactivate(m.id)}>Deactivate</Button>
                      )}
                      {m.status === "deactivated" && (
                        <Button size="sm" variant="ghost" onClick={() => handleReactivate(m.id)}>Reactivate</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
