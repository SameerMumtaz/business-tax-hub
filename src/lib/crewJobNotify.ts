import { supabase } from "@/integrations/supabase/client";

interface NotifyContext {
  jobId: string;
  jobTitle: string;
  siteName?: string;
  startDate: string;
  startTime?: string | null;
  estimatedHours?: number | null;
}

/**
 * Send a chat message to each affected crew member's crew channel
 * about a job change. Only notifies crew who are assigned to the job.
 */
export async function notifyCrewOfJobChange(
  businessUserId: string,
  assignedWorkerIds: string[],
  changeType: "created" | "rescheduled" | "hours_changed" | "edited",
  ctx: NotifyContext,
  extras?: {
    oldDate?: string;
    oldTime?: string | null;
    oldHours?: number | null;
    newHours?: number | null;
    editedFields?: string[];
  }
) {
  if (assignedWorkerIds.length === 0) return;

  // Look up crew channels for these workers
  const { data: channels } = await supabase
    .from("chat_channels")
    .select("id, crew_member_id, name")
    .eq("business_user_id", businessUserId)
    .eq("type", "crew")
    .in("crew_member_id", assignedWorkerIds);

  if (!channels || channels.length === 0) return;

  // Build message per worker (personalized with their hours if applicable)
  const message = buildMessage(changeType, ctx, extras);

  // Send to each crew channel
  const inserts = channels.map((ch) => ({
    channel_id: ch.id,
    sender_id: businessUserId,
    content: message,
  }));

  await supabase.from("chat_messages").insert(inserts);

  // Update channel timestamps
  const channelIds = channels.map((ch) => ch.id);
  for (const cid of channelIds) {
    await supabase
      .from("chat_channels")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", cid);
  }
}

function buildMessage(
  changeType: string,
  ctx: NotifyContext,
  extras?: {
    oldDate?: string;
    oldTime?: string | null;
    oldHours?: number | null;
    newHours?: number | null;
    editedFields?: string[];
  }
): string {
  const jobLabel = `"${ctx.jobTitle}"`;
  const site = ctx.siteName ? ` at ${ctx.siteName}` : "";
  const time = ctx.startTime ? ` at ${ctx.startTime}` : "";

  switch (changeType) {
    case "created":
      return `📋 New job assigned: ${jobLabel}${site}\n📅 ${ctx.startDate}${time}${ctx.estimatedHours ? `\n⏱ ${ctx.estimatedHours}h estimated` : ""}`;

    case "rescheduled": {
      const oldDate = extras?.oldDate || "unknown";
      const oldTime = extras?.oldTime ? ` at ${extras.oldTime}` : "";
      return `🔄 Job rescheduled: ${jobLabel}${site}\n📅 ${oldDate}${oldTime} → ${ctx.startDate}${time}`;
    }

    case "hours_changed": {
      const oldH = extras?.oldHours ?? "—";
      const newH = extras?.newHours ?? "—";
      return `⏱ Hours updated for ${jobLabel}${site}\n${oldH}h → ${newH}h`;
    }

    case "edited": {
      const fields = extras?.editedFields?.join(", ") || "details";
      return `✏️ Job updated: ${jobLabel}${site}\nChanged: ${fields}\n📅 ${ctx.startDate}${time}${ctx.estimatedHours ? ` · ${ctx.estimatedHours}h` : ""}`;
    }

    default:
      return `ℹ️ Update for job ${jobLabel}: ${changeType}`;
  }
}
