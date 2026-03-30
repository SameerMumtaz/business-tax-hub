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
      <div className="w-full sm:w-72 border-r bg-muted/30 p-3 space-y-2">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="w-72 border-r bg-muted/30 flex flex-col">
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold text-foreground">Channels</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {sections.map(section => (
            <div key={section.label}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1.5">
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
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors text-left",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-accent/60"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-70" />
                      <span className="truncate">{channel.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {channels.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No channels yet</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
