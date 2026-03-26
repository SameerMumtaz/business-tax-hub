import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Phone, Mail, User } from "lucide-react";
import { toast } from "sonner";

interface ClientContact {
  id: string;
  client_id: string;
  user_id: string;
  name: string;
  role_title: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
}

export default function ClientContactsPanel({ clientId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editContact, setEditContact] = useState<ClientContact | null>(null);
  const [form, setForm] = useState({ name: "", role_title: "", phone: "", email: "", notes: "" });

  const { data: contacts = [] } = useQuery({
    queryKey: ["client_contacts", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", clientId)
        .order("name");
      if (error) throw error;
      return (data || []) as ClientContact[];
    },
  });

  const resetForm = () => setForm({ name: "", role_title: "", phone: "", email: "", notes: "" });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("client_contacts").insert({
        client_id: clientId,
        user_id: user!.id,
        name: form.name,
        role_title: form.role_title || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_contacts", clientId] });
      resetForm();
      setOpen(false);
      toast.success("Contact added");
    },
    onError: () => toast.error("Failed to add contact"),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editContact) return;
      const { error } = await supabase.from("client_contacts").update({
        name: form.name,
        role_title: form.role_title || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
      }).eq("id", editContact.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_contacts", clientId] });
      resetForm();
      setEditContact(null);
      toast.success("Contact updated");
    },
    onError: () => toast.error("Failed to update contact"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_contacts", clientId] });
      toast.success("Contact removed");
    },
    onError: () => toast.error("Failed to delete contact"),
  });

  const openEdit = (c: ClientContact) => {
    setEditContact(c);
    setForm({
      name: c.name,
      role_title: c.role_title || "",
      phone: c.phone || "",
      email: c.email || "",
      notes: c.notes || "",
    });
  };

  const formFields = (
    <div className="space-y-3 pt-2">
      <Input placeholder="Contact name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      <Input placeholder="Role / Title (e.g. Site Manager)" value={form.role_title} onChange={e => setForm(f => ({ ...f, role_title: e.target.value }))} />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        <Input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
      </div>
      <Input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Points of Contact</h3>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" />Add Contact</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
            {formFields}
            <Button onClick={() => addMutation.mutate()} disabled={!form.name || addMutation.isPending} className="w-full">
              Save Contact
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No contacts added yet.</p>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => (
            <div key={c.id} className="flex items-start justify-between rounded-lg border bg-muted/30 p-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm">{c.name}</span>
                  {c.role_title && <span className="text-xs text-muted-foreground">· {c.role_title}</span>}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pl-5">
                  {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-primary transition-colors"><Phone className="h-3 w-3" />{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-primary transition-colors"><Mail className="h-3 w-3" />{c.email}</a>}
                </div>
                {c.notes && <p className="text-xs text-muted-foreground pl-5 mt-0.5">{c.notes}</p>}
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {c.name}?</AlertDialogTitle>
                      <AlertDialogDescription>This contact will be permanently removed.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editContact} onOpenChange={o => { if (!o) { setEditContact(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
          {formFields}
          <Button onClick={() => updateMutation.mutate()} disabled={!form.name || updateMutation.isPending} className="w-full">
            Save Changes
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
