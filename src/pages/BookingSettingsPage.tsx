import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useBookingPage, type BookingService } from "@/hooks/useBooking";
import { useProfile } from "@/hooks/useData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Copy, Link2, ExternalLink, Code } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BookingSettingsPage() {
  const { page, loading, createPage, updatePage } = useBookingPage();
  const { data: profile } = useProfile();

  // Setup form
  const [slug, setSlug] = useState("");
  const [bizName, setBizName] = useState("");

  // Service editor
  const [services, setServices] = useState<BookingService[]>([]);
  const [newService, setNewService] = useState({ name: "", duration_minutes: "60", price: "0" });
  const [dirty, setDirty] = useState(false);

  // Sync from page
  useState(() => {
    if (page) {
      setServices(page.services);
    }
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  if (!page) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto space-y-6 py-12">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Set Up Online Booking</h1>
            <p className="text-muted-foreground">Let clients book appointments directly from your website</p>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Business Name</label>
                <Input
                  value={bizName || profile?.business_name || ""}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="Your Business Name"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Booking URL Slug</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">/book/</span>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="my-business"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Your booking page will be at {window.location.origin}/book/{slug || "my-business"}
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => createPage(slug, bizName || profile?.business_name || "My Business")}
                disabled={!slug.trim()}
              >
                Create Booking Page
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const bookingUrl = `${window.location.origin}/book/${page.slug}`;
  const currentServices = dirty ? services : page.services;

  const addService = () => {
    if (!newService.name.trim()) { toast.error("Service name required"); return; }
    const updated = [...currentServices, {
      name: newService.name,
      duration_minutes: parseInt(newService.duration_minutes) || 60,
      price: parseFloat(newService.price) || 0,
    }];
    setServices(updated);
    setDirty(true);
    setNewService({ name: "", duration_minutes: "60", price: "0" });
  };

  const removeService = (i: number) => {
    const updated = currentServices.filter((_, idx) => idx !== i);
    setServices(updated);
    setDirty(true);
  };

  const saveServices = () => {
    updatePage({ services });
    setDirty(false);
  };

  const toggleDay = (day: number) => {
    const days = page.available_days.includes(day)
      ? page.available_days.filter(d => d !== day)
      : [...page.available_days, day].sort();
    updatePage({ available_days: days });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Online Booking</h1>
            <p className="text-muted-foreground text-sm mt-1">Configure your client booking page</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Active</span>
              <Switch
                checked={page.active}
                onCheckedChange={(active) => updatePage({ active })}
              />
            </div>
            <Badge variant={page.active ? "default" : "secondary"}>
              {page.active ? "Live" : "Paused"}
            </Badge>
          </div>
        </div>

        {/* Booking URL */}
        <Card>
          <CardHeader><CardTitle className="text-base">Booking Link</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input value={bookingUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => {
                navigator.clipboard.writeText(bookingUrl);
                toast.success("Link copied");
              }}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => window.open(bookingUrl, "_blank")}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
                <Code className="h-3.5 w-3.5" /> Embed Code
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <p className="text-xs font-medium mb-1">iframe embed:</p>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                    {`<iframe src="${bookingUrl}" width="100%" height="700" frameborder="0"></iframe>`}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Link button:</p>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                    {`<a href="${bookingUrl}" target="_blank" rel="noopener">Book an Appointment</a>`}
                  </pre>
                </div>
              </div>
            </details>
          </CardContent>
        </Card>

        {/* Services */}
        <Card>
          <CardHeader><CardTitle className="text-base">Services</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {currentServices.map((svc, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <span className="flex-1 font-medium text-sm">{svc.name}</span>
                <span className="text-xs text-muted-foreground">{svc.duration_minutes} min</span>
                <span className="text-xs font-mono">${svc.price}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeService(i)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input placeholder="Service name" value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })} />
              </div>
              <div className="w-24">
                <Input type="number" placeholder="Min" value={newService.duration_minutes}
                  onChange={(e) => setNewService({ ...newService, duration_minutes: e.target.value })} />
              </div>
              <div className="w-24">
                <Input type="number" placeholder="Price" value={newService.price}
                  onChange={(e) => setNewService({ ...newService, price: e.target.value })} />
              </div>
              <Button variant="outline" size="icon" onClick={addService}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {dirty && (
              <Button onClick={saveServices} className="w-full">Save Services</Button>
            )}
          </CardContent>
        </Card>

        {/* Availability */}
        <Card>
          <CardHeader><CardTitle className="text-base">Availability</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Available Days</label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((day, i) => (
                  <label key={i} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={page.available_days.includes(i)}
                      onCheckedChange={() => toggleDay(i)}
                    />
                    <span className="text-sm">{day}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Start Time</label>
                <Input
                  type="time"
                  value={page.available_hours_start}
                  onChange={(e) => updatePage({ available_hours_start: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">End Time</label>
                <Input
                  type="time"
                  value={page.available_hours_end}
                  onChange={(e) => updatePage({ available_hours_end: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Buffer Between Appointments (minutes)</label>
              <Input
                type="number"
                value={page.buffer_minutes}
                onChange={(e) => updatePage({ buffer_minutes: parseInt(e.target.value) || 0 })}
                className="w-32"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
