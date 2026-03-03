import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Shield, Users, Calendar, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import JobSchedulerContent from "@/components/team/JobSchedulerContent";
import TimesheetsContent from "@/components/team/TimesheetsContent";
import CrewMapContent from "@/components/team/CrewMapContent";

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

export default function TeamPage() {
  const { user } = useAuth();
  const { role: currentRole } = useTeamRole();
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const initialTab = params.get("tab") || "members";
  const [tab, setTab] = useState(initialTab);

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

  // Sync tab with URL
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const t = p.get("tab") || "members";
    setTab(t);
  }, [location.search]);

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    navigate(newTab === "members" ? "/team" : `/team?tab=${newTab}`, { replace: true });
  };

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

  const roleBadgeColor = (role: string) => role === "admin" ? "default" : role === "manager" ? "secondary" : "outline";
  const statusBadgeVariant = (status: string) =>
    status === "active" ? "default" as const : status === "invited" ? "secondary" as const : "destructive" as const;
  const canInviteRole = currentRole === "admin" ? ["manager", "crew"] : ["crew"];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage your team, schedule jobs, track hours, and monitor crew locations
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="members" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />Members
            </TabsTrigger>
            <TabsTrigger value="scheduler" className="gap-1.5">
              <Calendar className="h-3.5 w-3.5" />Job Scheduler
            </TabsTrigger>
            <TabsTrigger value="timesheets" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />Timesheets
            </TabsTrigger>
            <TabsTrigger value="crew-map" className="gap-1.5">
              <MapPin className="h-3.5 w-3.5" />Crew Map
            </TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members" className="mt-4 space-y-4">
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
                          <TableCell className="text-right">
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
          </TabsContent>

          {/* Job Scheduler Tab */}
          <TabsContent value="scheduler" className="mt-4">
            <JobSchedulerContent />
          </TabsContent>

          {/* Timesheets Tab */}
          <TabsContent value="timesheets" className="mt-4">
            <TimesheetsContent />
          </TabsContent>

          {/* Crew Map Tab */}
          <TabsContent value="crew-map" className="mt-4">
            <CrewMapContent />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
