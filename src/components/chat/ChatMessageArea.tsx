import { useState, useRef, useEffect } from "react";
import { ChatChannel, ChatMessage, ChatChannelMember } from "@/hooks/useChat";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send, Image, Pin, Trash2, MapPin, Briefcase, MoreVertical,
  Megaphone, User, Users, Hash,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

interface Props {
  channel: ChatChannel;
  messages: ChatMessage[];
  members: ChatChannelMember[];
  loading: boolean;
  currentUserId: string;
  senderNameMap: Record<string, string>;
  jobs: { id: string; title: string; site_id: string }[];
  sites: { id: string; name: string }[];
  onSend: (channelId: string, content: string, options?: any) => Promise<any>;
  onUploadPhoto: (file: File) => Promise<string | null>;
  onTogglePin: (messageId: string, pinned: boolean) => void;
  onDeleteMessage: (messageId: string) => void;
  isAdminOrManager: boolean;
}

const channelTypeIcon: Record<string, typeof User> = {
  crew: User,
  group: Hash,
  broadcast: Megaphone,
};

export default function ChatMessageArea({
  channel, messages, members, loading, currentUserId,
  senderNameMap, jobs, sites, onSend, onUploadPhoto,
  onTogglePin, onDeleteMessage, isAdminOrManager,
}: Props) {
  const [text, setText] = useState("");
  const [tagJobId, setTagJobId] = useState<string>("");
  const [tagSiteId, setTagSiteId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [showTagging, setShowTagging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !sending) return;
    setSending(true);
    await onSend(channel.id, trimmed, {
      job_id: tagJobId || undefined,
      job_site_id: tagSiteId || undefined,
    });
    setText("");
    setTagJobId("");
    setTagSiteId("");
    setShowTagging(false);
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSending(true);
    const url = await onUploadPhoto(file);
    if (url) {
      await onSend(channel.id, "", {
        photo_url: url,
        job_id: tagJobId || undefined,
        job_site_id: tagSiteId || undefined,
      });
    }
    setSending(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const pinnedMessages = messages.filter(m => m.is_pinned);

  const Icon = channelTypeIcon[channel.type] || User;

  // Group messages by date
  const groupedMessages: { date: string; msgs: ChatMessage[] }[] = [];
  messages.forEach(msg => {
    const dateStr = format(new Date(msg.created_at), "MMM d, yyyy");
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === dateStr) {
      last.msgs.push(msg);
    } else {
      groupedMessages.push({ date: dateStr, msgs: [msg] });
    }
  });

  const getSiteName = (siteId: string) => sites.find(s => s.id === siteId)?.name || "Unknown site";
  const getJobTitle = (jobId: string) => jobs.find(j => j.id === jobId)?.title || "Unknown job";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0">
      <div className="flex min-w-0 items-start gap-2 border-b px-3 py-3 sm:px-4">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate font-semibold text-foreground">{channel.name}</h2>
            {channel.type === "broadcast" && (
              <Badge variant="secondary" className="shrink-0 text-xs">Announcement</Badge>
            )}
          </div>
          {channel.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground hidden sm:block">{channel.description}</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </span>
      </div>

      {pinnedMessages.length > 0 && (
        <div className="flex items-center gap-2 border-b bg-accent/50 px-3 py-2 text-xs sm:px-4">
          <Pin className="h-3 w-3 text-primary" />
          <span className="font-medium text-primary">
            {pinnedMessages.length} pinned message{pinnedMessages.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex-1 space-y-3 p-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-3/4" />)}
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
          {groupedMessages.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-sm">No messages yet. Start the conversation!</p>
            </div>
          )}
          {groupedMessages.map(group => (
            <div key={group.date}>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground">{group.date}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {group.msgs.map(msg => {
                const isOwn = msg.sender_id === currentUserId;
                const senderName = senderNameMap[msg.sender_id] || "Unknown";
                return (
                  <div
                    key={msg.id}
                    className={`group mb-2 flex items-start gap-1.5 sm:gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`flex max-w-[82%] flex-col ${isOwn ? "items-end" : "items-start"} sm:max-w-[70%]`}>
                      {!isOwn && (
                        <span className="mb-0.5 px-1 text-xs text-muted-foreground">{senderName}</span>
                      )}
                      <div
                        className={`relative rounded-xl px-3 py-2 text-sm ${
                          isOwn
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted text-foreground rounded-tl-sm"
                        } ${msg.is_pinned ? "ring-1 ring-primary/30" : ""}`}
                      >
                        {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                        {msg.photo_url && (
                          <img
                            src={msg.photo_url}
                            alt="Shared photo"
                            className="mt-1 max-h-60 max-w-full cursor-pointer rounded-lg object-cover"
                            onClick={() => window.open(msg.photo_url!, "_blank")}
                          />
                        )}
                        {(msg.job_id || msg.job_site_id) && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {msg.job_id && (
                              <Badge variant="outline" className="gap-0.5 text-[10px]">
                                <Briefcase className="h-2.5 w-2.5" />
                                {getJobTitle(msg.job_id)}
                              </Badge>
                            )}
                            {msg.job_site_id && (
                              <Badge variant="outline" className="gap-0.5 text-[10px]">
                                <MapPin className="h-2.5 w-2.5" />
                                {getSiteName(msg.job_site_id)}
                              </Badge>
                            )}
                          </div>
                        )}
                        <span className={`mt-1 block text-[10px] ${isOwn ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {format(new Date(msg.created_at), "h:mm a")}
                          {msg.is_pinned && <Pin className="ml-1 inline h-2.5 w-2.5 text-primary" />}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start pt-5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isOwn ? "end" : "start"}>
                          {isAdminOrManager && (
                            <DropdownMenuItem onClick={() => onTogglePin(msg.id, msg.is_pinned)}>
                              <Pin className="mr-2 h-3.5 w-3.5" />
                              {msg.is_pinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                          )}
                          {(isOwn || isAdminOrManager) && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => onDeleteMessage(msg.id)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {(channel.type !== "broadcast" || isAdminOrManager) && (
        <div className="space-y-2 border-t bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {showTagging && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Select value={tagJobId} onValueChange={setTagJobId}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-48">
                  <SelectValue placeholder="Link to job..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No job</SelectItem>
                  {jobs.map(j => (
                    <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tagSiteId} onValueChange={setTagSiteId}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-48">
                  <SelectValue placeholder="Link to site..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No site</SelectItem>
                  {sites.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setShowTagging(!showTagging)}
              title="Tag job or site"
            >
              <Briefcase className="h-4 w-4" />
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => fileRef.current?.click()}
              title="Send photo"
            >
              <Image className="h-4 w-4" />
            </Button>
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="h-9 min-w-0 flex-1"
              disabled={sending}
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleSend}
              disabled={!text.trim() || sending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
