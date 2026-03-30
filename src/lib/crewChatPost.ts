import { supabase } from "@/integrations/supabase/client";

/**
 * Find the crew chat channel for a given team member.
 * Returns the channel id or null.
 */
async function getCrewChannelId(teamMemberId: string): Promise<string | null> {
  const { data } = await supabase
    .from("chat_channels")
    .select("id")
    .eq("crew_member_id", teamMemberId)
    .eq("type", "crew")
    .limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * Post an automated system message to a crew member's chat channel.
 * Fails silently if no channel exists (chat may not be set up yet).
 */
export async function postCrewChatMessage(
  senderUserId: string,
  teamMemberId: string,
  content: string,
  options?: {
    job_id?: string;
    job_site_id?: string;
    occurrence_date?: string;
    photo_url?: string;
  }
) {
  const channelId = await getCrewChannelId(teamMemberId);
  if (!channelId) return;

  await supabase.from("chat_messages").insert({
    channel_id: channelId,
    sender_id: senderUserId,
    content,
    job_id: options?.job_id || null,
    job_site_id: options?.job_site_id || null,
    occurrence_date: options?.occurrence_date || null,
    photo_url: options?.photo_url || null,
  });

  // Bump channel updated_at
  await supabase
    .from("chat_channels")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", channelId);
}
