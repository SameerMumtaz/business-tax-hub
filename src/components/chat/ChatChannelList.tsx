import { ChatChannel } from "@/hooks/useChat";
import { Users, Megaphone, User, MessageSquare, Hash } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  channels: ChatChannel[];
  activeChannelId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  currentUserId: string;
  senderNameMap: Record<string, string>;
}

const typeIcons: Record<string, typeof Users> = {
  crew: User,
  group: Users,
  broadcast: Megaphone,
  direct: MessageSquare,
};

const typeLabels: Record<string, string> = {
  crew: "Crew",
  group: "Groups",
  broadcast: "Announcements",
};

export default function ChatChannelList({ channels, activeChannelId, onSelect, loading, currentUserId, senderNameMap }: Props) {
  const crewChannels = channels.filter(c => c.type === "crew");
  const groupChannels = channels.filter(c => c.type === "group");
  const broadcastChannels = channels.filter(c => c.type === "broadcast");

  const sections = [
    { label: "Crew", channels: crewChannels, icon: User },
    { label: "Groups", channels: groupChannels, icon: Hash },
    { label: "Announcements", channels: broadcastChannels, icon: Megaphone },
  ].filter(s => s.channels.length > 0);

  if (loading) {
    return (
      <div className="w-full bg-muted/30 p-3 space-y-2 sm:w-72 sm:border-r">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-muted/30 sm:w-72 sm:border-r">
      <div className="border-b p-3">
        <h3 className="text-sm font-semibold text-foreground">Channels</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-2">
          {sections.map(section => (
            <div key={section.label}>
              <p className="mb-1.5 flex items-center gap-1.5 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <section.icon className="h-3 w-3" />
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.channels.map(channel => {
                  const Icon = typeIcons[channel.type] || MessageSquare;
                  const isActive = channel.id === activeChannelId;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => onSelect(channel.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground hover:bg-accent/60"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-70" />
                      <span className="min-w-0 truncate">{channel.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {channels.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No channels yet</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
