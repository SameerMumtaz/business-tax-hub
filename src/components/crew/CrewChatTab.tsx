import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useChat } from "@/hooks/useChat";
import { supabase } from "@/integrations/supabase/client";
import ChatChannelList from "@/components/chat/ChatChannelList";
import ChatMessageArea from "@/components/chat/ChatMessageArea";
import { MessageSquare, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CrewChatTab() {
  const { user } = useAuth();
  const { role, businessUserId, teamMemberId } = useTeamRole();
  const chat = useChat();
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [showMessages, setShowMessages] = useState(false);

  const effectiveBusinessId = role === "admin" ? user?.id : businessUserId;
  const isCrew = role === "crew";

  useEffect(() => {
    if (!effectiveBusinessId) return;
    supabase
      .from("team_members")
      .select("id, name, email, member_user_id, role, status")
      .eq("business_user_id", effectiveBusinessId)
      .eq("status", "active")
      .then(({ data }) => setTeamMembers(data || []));
  }, [effectiveBusinessId]);

  // For crew: only fetch jobs they're assigned to + those jobs' sites
  // For admin/manager: fetch all jobs and sites
  useEffect(() => {
    if (!effectiveBusinessId) return;

    const fetchScopedData = async () => {
      if (isCrew && teamMemberId) {
        // Get only assigned job IDs
        const { data: assignments } = await supabase
          .from("job_assignments")
          .select("job_id")
          .eq("worker_id", teamMemberId);
        const jobIds = [...new Set((assignments || []).map(a => a.job_id))];

        if (jobIds.length === 0) {
          setJobs([]);
          setSites([]);
          return;
        }

        const { data: jobData } = await supabase
          .from("jobs")
          .select("id, title, site_id")
          .in("id", jobIds);
        setJobs(jobData || []);

        const siteIds = [...new Set((jobData || []).map(j => j.site_id))];
        if (siteIds.length > 0) {
          const { data: siteData } = await supabase
            .from("job_sites")
            .select("id, name")
            .in("id", siteIds);
          setSites(siteData || []);
        } else {
          setSites([]);
        }
      } else {
        // Admin/manager sees all
        const [jobRes, siteRes] = await Promise.all([
          supabase.from("jobs").select("id, title, site_id").eq("user_id", effectiveBusinessId),
          supabase.from("job_sites").select("id, name").eq("user_id", effectiveBusinessId),
        ]);
        setJobs(jobRes.data || []);
        setSites(siteRes.data || []);
      }
    };
    fetchScopedData();
  }, [effectiveBusinessId, isCrew, teamMemberId]);

  const senderNameMap: Record<string, string> = {};
  if (user) senderNameMap[user.id] = "You";
  teamMembers.forEach(tm => {
    if (tm.member_user_id) senderNameMap[tm.member_user_id] = tm.name;
  });

  const activeChannel = chat.channels.find(c => c.id === chat.activeChannelId) || null;

  const handleSelectChannel = (id: string) => {
    chat.selectChannel(id);
    setShowMessages(true);
  };

  const handleBack = () => {
    setShowMessages(false);
  };

  return (
    <div className="flex min-h-[70dvh] flex-col md:h-[calc(100dvh-16rem)]">
      {!showMessages || !activeChannel ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex items-center gap-2 shrink-0">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Messages</h2>
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
            <ChatChannelList
              channels={chat.channels}
              activeChannelId={chat.activeChannelId}
              onSelect={handleSelectChannel}
              loading={chat.loading}
              currentUserId={user?.id || ""}
              senderNameMap={senderNameMap}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="self-start gap-1.5 px-1 text-muted-foreground shrink-0"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
            <ChatMessageArea
              channel={activeChannel}
              messages={chat.messages}
              members={chat.members}
              loading={chat.messagesLoading}
              currentUserId={user?.id || ""}
              senderNameMap={senderNameMap}
              jobs={jobs}
              sites={sites}
              onSend={chat.sendMessage}
              onUploadPhoto={chat.uploadPhoto}
              onTogglePin={chat.togglePin}
              onDeleteMessage={chat.deleteMessage}
              isAdminOrManager={!isCrew}
            />
          </div>
        </div>
      )}
    </div>
  );
}
