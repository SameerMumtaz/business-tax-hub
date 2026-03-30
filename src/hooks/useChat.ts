import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ChatChannel {
  id: string;
  business_user_id: string;
  type: "crew" | "direct" | "group" | "broadcast";
  name: string;
  description: string | null;
  crew_member_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChatChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  last_read_at: string | null;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  photo_url: string | null;
  job_id: string | null;
  job_site_id: string | null;
  occurrence_date: string | null;
  parent_message_id: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  // joined from profiles
  sender_name?: string;
}

export function useChat() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatChannelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const fetchChannels = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("chat_channels")
      .select("*")
      .order("updated_at", { ascending: false });
    setChannels((data || []) as ChatChannel[]);
    setLoading(false);
  }, [user]);

  const fetchMessages = useCallback(async (channelId: string) => {
    if (!channelId) return;
    setMessagesLoading(true);
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true });
    setMessages((data || []) as ChatMessage[]);
    setMessagesLoading(false);

    // Update last_read_at
    if (user) {
      await supabase
        .from("chat_channel_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("user_id", user.id);
    }
  }, [user]);

  const fetchMembers = useCallback(async (channelId: string) => {
    if (!channelId) return;
    const { data } = await supabase
      .from("chat_channel_members")
      .select("*")
      .eq("channel_id", channelId);
    setMembers((data || []) as ChatChannelMember[]);
  }, []);

  // Set active channel and load data
  const selectChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    fetchMessages(channelId);
    fetchMembers(channelId);
  }, [fetchMessages, fetchMembers]);

  // Send message
  const sendMessage = useCallback(async (
    channelId: string,
    content: string,
    options?: {
      photo_url?: string;
      job_id?: string;
      job_site_id?: string;
      occurrence_date?: string;
      parent_message_id?: string;
    }
  ) => {
    if (!user) return;
    const { error } = await supabase.from("chat_messages").insert({
      channel_id: channelId,
      sender_id: user.id,
      content,
      photo_url: options?.photo_url || null,
      job_id: options?.job_id || null,
      job_site_id: options?.job_site_id || null,
      occurrence_date: options?.occurrence_date || null,
      parent_message_id: options?.parent_message_id || null,
    });
    if (!error) {
      // Update channel updated_at
      await supabase
        .from("chat_channels")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", channelId);
    }
    return error;
  }, [user]);

  // Create group channel
  const createGroupChannel = useCallback(async (
    businessUserId: string,
    name: string,
    description: string,
    memberUserIds: string[]
  ) => {
    if (!user) return;
    const { data: channel, error } = await supabase
      .from("chat_channels")
      .insert({
        business_user_id: businessUserId,
        type: "group",
        name,
        description,
        created_by: user.id,
      })
      .select()
      .single();
    if (error || !channel) return error;

    // Add members
    const membersToInsert = [...new Set([user.id, ...memberUserIds])].map(uid => ({
      channel_id: channel.id,
      user_id: uid,
      role: uid === user.id ? "owner" : "member",
    }));
    await supabase.from("chat_channel_members").insert(membersToInsert);
    await fetchChannels();
    return null;
  }, [user, fetchChannels]);

  // Create broadcast channel
  const createBroadcastChannel = useCallback(async (
    businessUserId: string,
    name: string,
    memberUserIds: string[]
  ) => {
    if (!user) return;
    const { data: channel, error } = await supabase
      .from("chat_channels")
      .insert({
        business_user_id: businessUserId,
        type: "broadcast",
        name,
        description: "Announcements",
        created_by: user.id,
      })
      .select()
      .single();
    if (error || !channel) return error;

    const membersToInsert = [...new Set([user.id, ...memberUserIds])].map(uid => ({
      channel_id: channel.id,
      user_id: uid,
      role: uid === user.id ? "owner" : "member",
    }));
    await supabase.from("chat_channel_members").insert(membersToInsert);
    await fetchChannels();
    return null;
  }, [user, fetchChannels]);

  // Auto-create crew channel for a team member
  const ensureCrewChannel = useCallback(async (
    businessUserId: string,
    teamMemberId: string,
    memberUserId: string,
    memberName: string
  ) => {
    if (!user) return;
    // Check if crew channel already exists
    const { data: existing } = await supabase
      .from("chat_channels")
      .select("id")
      .eq("crew_member_id", teamMemberId)
      .eq("type", "crew")
      .limit(1);
    if (existing && existing.length > 0) return existing[0].id;

    // Create crew channel
    const { data: channel } = await supabase
      .from("chat_channels")
      .insert({
        business_user_id: businessUserId,
        type: "crew",
        name: memberName,
        crew_member_id: teamMemberId,
        created_by: businessUserId,
      })
      .select()
      .single();
    if (!channel) return null;

    // Add business owner + crew member
    await supabase.from("chat_channel_members").insert([
      { channel_id: channel.id, user_id: businessUserId, role: "owner" },
      { channel_id: channel.id, user_id: memberUserId, role: "member" },
    ]);
    return channel.id;
  }, [user]);

  // Upload photo
  const uploadPhoto = useCallback(async (file: File) => {
    if (!user) return null;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("chat-photos").upload(path, file);
    if (error) return null;
    const { data } = supabase.storage.from("chat-photos").getPublicUrl(path);
    return data.publicUrl;
  }, [user]);

  // Pin/unpin message
  const togglePin = useCallback(async (messageId: string, pinned: boolean) => {
    await supabase.from("chat_messages").update({ is_pinned: !pinned }).eq("id", messageId);
    if (activeChannelId) fetchMessages(activeChannelId);
  }, [activeChannelId, fetchMessages]);

  // Delete message
  const deleteMessage = useCallback(async (messageId: string) => {
    await supabase.from("chat_messages").delete().eq("id", messageId);
    if (activeChannelId) fetchMessages(activeChannelId);
  }, [activeChannelId, fetchMessages]);

  // Initial load
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Realtime for messages in active channel
  useEffect(() => {
    if (!activeChannelId) return;
    const channel = supabase
      .channel(`chat-messages-${activeChannelId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_messages",
        filter: `channel_id=eq.${activeChannelId}`,
      }, () => {
        fetchMessages(activeChannelId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId, fetchMessages]);

  return {
    channels,
    activeChannelId,
    messages,
    members,
    loading,
    messagesLoading,
    selectChannel,
    sendMessage,
    createGroupChannel,
    createBroadcastChannel,
    ensureCrewChannel,
    uploadPhoto,
    togglePin,
    deleteMessage,
    fetchChannels,
  };
}
