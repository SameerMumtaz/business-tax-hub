import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useChat, ChatChannel } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { useTeamRole } from "@/hooks/useTeamRole";
import { supabase } from "@/integrations/supabase/client";
import ChatChannelList from "@/components/chat/ChatChannelList";
import ChatMessageArea from "@/components/chat/ChatMessageArea";
import CreateChannelDialog from "@/components/chat/CreateChannelDialog";
import { MessageSquare } from "lucide-react";

export default function ChatPage() {
  const { user } = useAuth();
  const { role, businessUserId } = useTeamRole();
  const chat = useChat();
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const isAdminOrManager = role === "admin" || role === "manager";

  // Determine the business user id for the current context
  const effectiveBusinessId = role === "admin" ? user?.id : businessUserId;

  // Load team members for group creation and sender names
  useEffect(() => {
    if (!effectiveBusinessId) return;
    supabase
      .from("team_members")
      .select("id, name, email, member_user_id, role, status")
      .eq("business_user_id", effectiveBusinessId)
      .eq("status", "active")
      .then(({ data }) => setTeamMembers(data || []));
  }, [effectiveBusinessId]);

  // Load jobs and sites for tagging
  useEffect(() => {
    if (!effectiveBusinessId) return;
    supabase.from("jobs").select("id, title, site_id").eq("user_id", effectiveBusinessId)
      .then(({ data }) => setJobs(data || []));
    supabase.from("job_sites").select("id, name").eq("user_id", effectiveBusinessId)
      .then(({ data }) => setSites(data || []));
  }, [effectiveBusinessId]);

  // Auto-create crew channels for existing team members (admin only)
  useEffect(() => {
    if (role !== "admin" || !user || !teamMembers.length) return;
    teamMembers.forEach(async (tm) => {
      if (tm.member_user_id) {
        await chat.ensureCrewChannel(user.id, tm.id, tm.member_user_id, tm.name);
      }
    });
    // Refresh channels after ensuring
    const timer = setTimeout(() => chat.fetchChannels(), 1500);
    return () => clearTimeout(timer);
  }, [role, user, teamMembers.length]);

  // Build sender name map
  const senderNameMap: Record<string, string> = {};
  if (user) senderNameMap[user.id] = "You";
  teamMembers.forEach(tm => {
    if (tm.member_user_id) senderNameMap[tm.member_user_id] = tm.name;
  });

  const activeChannel = chat.channels.find(c => c.id === chat.activeChannelId) || null;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-6rem)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-6 w-6" />
              Team Chat
            </h1>
            <p className="text-sm text-muted-foreground">Message your crew, share updates, and coordinate jobs</p>
          </div>
          {isAdminOrManager && effectiveBusinessId && (
            <CreateChannelDialog
              businessUserId={effectiveBusinessId}
              teamMembers={teamMembers}
              onCreateGroup={chat.createGroupChannel}
              onCreateBroadcast={chat.createBroadcastChannel}
            />
          )}
        </div>

        <div className="flex flex-1 border rounded-lg overflow-hidden bg-card min-h-0">
          {/* Channel sidebar */}
          <ChatChannelList
            channels={chat.channels}
            activeChannelId={chat.activeChannelId}
            onSelect={chat.selectChannel}
            loading={chat.loading}
            currentUserId={user?.id || ""}
            senderNameMap={senderNameMap}
          />

          {/* Message area */}
          {activeChannel ? (
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
              isAdminOrManager={isAdminOrManager}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <MessageSquare className="h-12 w-12 mx-auto opacity-30" />
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm">Choose a channel from the sidebar to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
