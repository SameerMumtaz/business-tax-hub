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
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold text-foreground truncate">{channel.name}</h2>
        {channel.type === "broadcast" && (
          <Badge variant="secondary" className="text-xs">Announcement</Badge>
        )}
        {channel.description && (
          <span className="text-xs text-muted-foreground ml-2 truncate hidden sm:inline">{channel.description}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Pinned messages bar */}
      {pinnedMessages.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b flex items-center gap-2 text-xs">
          <Pin className="h-3 w-3 text-amber-600" />
          <span className="text-amber-700 dark:text-amber-400 font-medium">
            {pinnedMessages.length} pinned message{pinnedMessages.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Messages */}
      {loading ? (
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-3/4" />)}
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
          {groupedMessages.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-sm">No messages yet. Start the conversation!</p>
            </div>
          )}
          {groupedMessages.map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">{group.date}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {group.msgs.map(msg => {
                const isOwn = msg.sender_id === currentUserId;
                const senderName = senderNameMap[msg.sender_id] || "Unknown";
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2 mb-2 group ${isOwn ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`max-w-[70%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                      {!isOwn && (
                        <span className="text-xs text-muted-foreground mb-0.5 px-1">{senderName}</span>
                      )}
                      <div
                        className={`rounded-xl px-3 py-2 text-sm relative ${
                          isOwn
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted text-foreground rounded-tl-sm"
                        } ${msg.is_pinned ? "ring-1 ring-amber-400" : ""}`}
                      >
                        {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                        {msg.photo_url && (
                          <img
                            src={msg.photo_url}
                            alt="Shared photo"
                            className="rounded-lg mt-1 max-w-full max-h-60 object-cover cursor-pointer"
                            onClick={() => window.open(msg.photo_url!, "_blank")}
                          />
                        )}
                        {/* Job/Site tags */}
                        {(msg.job_id || msg.job_site_id) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {msg.job_id && (
                              <Badge variant="outline" className="text-[10px] gap-0.5">
                                <Briefcase className="h-2.5 w-2.5" />
                                {getJobTitle(msg.job_id)}
                              </Badge>
                            )}
                            {msg.job_site_id && (
                              <Badge variant="outline" className="text-[10px] gap-0.5">
                                <MapPin className="h-2.5 w-2.5" />
                                {getSiteName(msg.job_site_id)}
                              </Badge>
                            )}
                          </div>
                        )}
                        <span className={`text-[10px] mt-1 block ${isOwn ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {format(new Date(msg.created_at), "h:mm a")}
                          {msg.is_pinned && <Pin className="h-2.5 w-2.5 inline ml-1 text-amber-500" />}
                        </span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-start pt-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isOwn ? "end" : "start"}>
                          {isAdminOrManager && (
                            <DropdownMenuItem onClick={() => onTogglePin(msg.id, msg.is_pinned)}>
                              <Pin className="h-3.5 w-3.5 mr-2" />
                              {msg.is_pinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                          )}
                          {(isOwn || isAdminOrManager) && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => onDeleteMessage(msg.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
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

      {/* Input area */}
      {(channel.type !== "broadcast" || isAdminOrManager) && (
        <div className="border-t p-3 space-y-2">
          {/* Tagging row */}
          {showTagging && (
            <div className="flex gap-2 flex-wrap">
              <Select value={tagJobId} onValueChange={setTagJobId}>
                <SelectTrigger className="w-48 h-8 text-xs">
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
                <SelectTrigger className="w-48 h-8 text-xs">
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
          <div className="flex items-center gap-2">
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
              className="flex-1 h-9"
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
