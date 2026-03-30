import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  businessUserId: string;
  teamMembers: { id: string; name: string; member_user_id: string | null; role: string }[];
  onCreateGroup: (businessUserId: string, name: string, description: string, memberUserIds: string[]) => Promise<any>;
  onCreateBroadcast: (businessUserId: string, name: string, memberUserIds: string[]) => Promise<any>;
}

export default function CreateChannelDialog({ businessUserId, teamMembers, onCreateGroup, onCreateBroadcast }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"group" | "broadcast">("group");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const eligibleMembers = teamMembers.filter(tm => tm.member_user_id);

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Please enter a channel name");
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one member");
      return;
    }
    setCreating(true);
    let error;
    if (type === "group") {
      error = await onCreateGroup(businessUserId, name.trim(), description.trim(), selectedMembers);
    } else {
      error = await onCreateBroadcast(businessUserId, name.trim(), selectedMembers);
    }
    setCreating(false);
    if (error) {
      toast.error("Failed to create channel");
    } else {
      toast.success(`${type === "group" ? "Group" : "Broadcast"} channel created`);
      setOpen(false);
      setName("");
      setDescription("");
      setSelectedMembers([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Channel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v: "group" | "broadcast") => setType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">Group Chat</SelectItem>
                <SelectItem value="broadcast">Broadcast (Announcements)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Channel Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. North District Crew" />
          </div>
          {type === "group" && (
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this group for?" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Members</Label>
            <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
              {eligibleMembers.length === 0 && (
                <p className="text-sm text-muted-foreground py-2 text-center">No active team members found</p>
              )}
              {eligibleMembers.map(tm => (
                <label
                  key={tm.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selectedMembers.includes(tm.member_user_id!)}
                    onCheckedChange={() => toggleMember(tm.member_user_id!)}
                  />
                  <span>{tm.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto capitalize">{tm.role}</span>
                </label>
              ))}
            </div>
            {type === "broadcast" && (
              <p className="text-xs text-muted-foreground">Only admins and managers can post in broadcast channels</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create Channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
