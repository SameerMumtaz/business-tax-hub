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
  const { role, businessUserId } = useTeamRole();
  const chat = useChat();
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [showMessages, setShowMessages] = useState(false);

  const effectiveBusinessId = role === "admin" ? user?.id : businessUserId;

  useEffect(() => {
    if (!effectiveBusinessId) return;
    supabase
      .from("team_members")
      .select("id, name, email, member_user_id, role, status")
      .eq("business_user_id", effectiveBusinessId)
      .eq("status", "active")
      .then(({ data }) => setTeamMembers(data || []));
  }, [effectiveBusinessId]);

  useEffect(() => {
    if (!effectiveBusinessId) return;
    supabase.from("jobs").select("id, title, site_id").eq("user_id", effectiveBusinessId)
      .then(({ data }) => setJobs(data || []));
    supabase.from("job_sites").select("id, name").eq("user_id", effectiveBusinessId)
      .then(({ data }) => setSites(data || []));
  }, [effectiveBusinessId]);

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

  // Use a fixed height that accounts for the crew dashboard header + tabs + padding
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 16rem)" }}>
      {!showMessages || !activeChannel ? (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Messages</h2>
          </div>
          <div className="flex-1 border rounded-lg overflow-hidden bg-card min-h-0">
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
        <div className="flex flex-col h-full min-h-0">
          <Button
            variant="ghost"
            size="sm"
            className="self-start mb-1 gap-1.5 text-muted-foreground shrink-0"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex-1 border rounded-lg overflow-hidden bg-card min-h-0 flex flex-col">
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
              isAdminOrManager={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
