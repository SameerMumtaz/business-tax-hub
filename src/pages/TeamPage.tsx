import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
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
import { UserPlus, Shield, Users, Mail } from "lucide-react";
import { toast } from "sonner";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  accepted_at: string | null;
}

export default function TeamPage() {
  const { user } = useAuth();
  const { role: currentRole } = useTeamRole();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("crew");
  const [sending, setSending] = useState(false);

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

  useEffect(() => {
    fetchMembers();
  }, [user]);

  const handleInvite = async () => {
    if (!user || !inviteName.trim() || !inviteEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setSending(true);

    try {
      const res = await supabase.functions.invoke("invite-crew", {
        body: {
          email: inviteEmail.trim(),
          name: inviteName.trim(),
          role: inviteRole,
          business_user_id: user.id,
        },
      });

      if (res.error) throw res.error;
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("crew");
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setSending(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    await supabase.from("team_members").update({ status: "deactivated" }).eq("id", id);
    toast.success("Member deactivated");
    fetchMembers();
  };

  const handleReactivate = async (id: string) => {
    await supabase.from("team_members").update({ status: "active" }).eq("id", id);
    toast.success("Member reactivated");
    fetchMembers();
  };

  const roleBadgeColor = (role: string) => {
    if (role === "admin") return "default";
    if (role === "manager") return "secondary";
    return "outline";
  };

  const statusBadgeVariant = (status: string) => {
    if (status === "active") return "default" as const;
    if (status === "invited") return "secondary" as const;
    return "destructive" as const;
  };

  const canInviteRole = currentRole === "admin" ? ["manager", "crew"] : ["crew"];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
            <p className="text-sm text-muted-foreground">
              Invite and manage your team members
            </p>
          </div>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Input
                  placeholder="Full name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
                <Input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canInviteRole.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="w-full" onClick={handleInvite} disabled={sending}>
                  {sending ? "Sending…" : "Send Invitation"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{members.length}</div>
            </CardContent>
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

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <p className="text-muted-foreground text-center py-8">Loading…</p>
            ) : members.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground">No team members yet</p>
                <p className="text-sm text-muted-foreground">
                  Invite managers and crew members to get started
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
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
                          <Shield className="h-3 w-3 mr-1" />
                          {m.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(m.status)}>{m.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(m.invited_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.status === "active" && (
                          <Button size="sm" variant="ghost" onClick={() => handleDeactivate(m.id)}>
                            Deactivate
                          </Button>
                        )}
                        {m.status === "deactivated" && (
                          <Button size="sm" variant="ghost" onClick={() => handleReactivate(m.id)}>
                            Reactivate
                          </Button>
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
    </DashboardLayout>
  );
}
