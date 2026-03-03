import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  compact?: boolean;
}

export default function LinkToBusinessCard({ compact = false }: Props) {
  const { user } = useAuth();
  const { refetch } = useTeamRole();
  const [bookieCode, setBookieCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkedBusinesses, setLinkedBusinesses] = useState<{ name: string; role: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("team_members")
      .select("business_user_id, role, status")
      .eq("member_user_id", user.id)
      .eq("status", "active")
      .then(async ({ data }) => {
        if (!data?.length) return;
        const bizIds = data.map((d: any) => d.business_user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, business_name")
          .in("user_id", bizIds);
        const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.business_name]));
        setLinkedBusinesses(
          data.map((d: any) => ({
            name: nameMap.get(d.business_user_id) || "Unknown Business",
            role: d.role,
          }))
        );
      });
  }, [user]);

  const handleLink = async () => {
    if (!user || !bookieCode.trim()) return;
    setLinking(true);
    try {
      const code = bookieCode.trim().toUpperCase();
      const { data: bizProfile, error } = await supabase
        .from("profiles")
        .select("user_id, business_name")
        .eq("bookie_id", code)
        .maybeSingle();

      if (error || !bizProfile) {
        toast.error("No business found with that Bookie ID");
        setLinking(false);
        return;
      }

      if (bizProfile.user_id === user.id) {
        toast.error("You cannot link to your own business");
        setLinking(false);
        return;
      }

      const { data: existing } = await supabase
        .from("team_members")
        .select("id, status")
        .eq("business_user_id", bizProfile.user_id)
        .eq("member_user_id", user.id)
        .maybeSingle();

      if (existing?.status === "active") {
        toast.info("Already linked to this business");
        setLinking(false);
        return;
      }

      if (existing) {
        await supabase
          .from("team_members")
          .update({ status: "active", accepted_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("team_members").insert({
          business_user_id: bizProfile.user_id,
          member_user_id: user.id,
          email: user.email || "",
          name: user.email?.split("@")[0] || "Team Member",
          role: "crew" as any,
          status: "active",
          accepted_at: new Date().toISOString(),
        });
      }

      toast.success(`Linked to ${bizProfile.business_name || "business"}!`);
      setBookieCode("");
      refetch();
      setLinkedBusinesses((prev) => [
        ...prev,
        { name: bizProfile.business_name || "Unknown", role: "crew" },
      ]);
    } catch (err: any) {
      toast.error(err.message || "Failed to link");
    }
    setLinking(false);
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {linkedBusinesses.length > 0 && (
          <div className="space-y-1">
            {linkedBusinesses.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-sidebar-accent px-2 py-1 rounded">
                <span className="truncate">{b.name}</span>
                <Badge variant="secondary" className="text-[10px] px-1">{b.role}</Badge>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <Input
            placeholder="Bookie ID"
            value={bookieCode}
            onChange={(e) => setBookieCode(e.target.value)}
            className="h-8 text-xs"
          />
          <Button size="sm" className="h-8 px-2 text-xs" onClick={handleLink} disabled={linking || !bookieCode.trim()}>
            {linking ? "…" : "Link"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Link to a Business
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {linkedBusinesses.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Linked businesses:</p>
            {linkedBusinesses.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-muted px-3 py-1.5 rounded-md">
                <span>{b.name}</span>
                <Badge variant="secondary" className="text-xs">{b.role}</Badge>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Enter Bookie ID (e.g. BK-A3X9)"
            value={bookieCode}
            onChange={(e) => setBookieCode(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleLink} disabled={linking || !bookieCode.trim()}>
            {linking ? "Linking…" : "Link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
