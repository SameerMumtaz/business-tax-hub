import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { type BookingPage, type BookingService } from "@/hooks/useBooking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { CheckCircle2, Clock, DollarSign, ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "service" | "date" | "time" | "details" | "confirmed";

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<BookingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<BookingService | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [existingBookings, setExistingBookings] = useState<{ requested_date: string; requested_time: string; duration_minutes: number }[]>([]);
  const [existingJobs, setExistingJobs] = useState<{ start_date: string; start_time: string | null; estimated_hours: number | null }[]>([]);

  useEffect(() => {
    const fetchPage = async () => {
      if (!slug) return;
      const { data, error: err } = await supabase
        .from("booking_pages")
        .select("*")
        .eq("slug", slug)
        .eq("active", true)
        .single();
      if (err || !data) { setError(true); setLoading(false); return; }
      setPage({
        ...data,
        services: (data.services as any) || [],
        available_days: data.available_days || [1, 2, 3, 4, 5],
      } as BookingPage);
      setLoading(false);
    };
    fetchPage();
  }, [slug]);

  // Fetch existing bookings AND jobs when date changes
  useEffect(() => {
    if (!page || !selectedDate) return;
    const dateStr = selectedDate.toISOString().slice(0, 10);
    
    // Fetch booking requests for conflict check
    supabase
      .from("booking_requests")
      .select("requested_date, requested_time, duration_minutes")
      .eq("booking_page_id", page.id)
      .eq("requested_date", dateStr)
      .in("status", ["pending", "confirmed"])
      .then(({ data }) => {
        setExistingBookings((data || []) as any);
      });

    // Fetch jobs for the business user on this date to check for time conflicts
    // Jobs created from bookings have time info in their description
    supabase
      .from("jobs")
      .select("start_date, start_time, estimated_hours")
      .eq("user_id", page.user_id)
      .eq("start_date", dateStr)
      .in("status", ["scheduled", "in_progress"])
      .then(({ data }) => {
        setExistingJobs((data || []) as any);
      });
  }, [page, selectedDate]);

  // Build time blocks from job start_time + estimated_hours
  const jobTimeBlocks = useMemo(() => {
    const blocks: { start: number; end: number }[] = [];
    for (const job of existingJobs) {
      if (!job.start_time || !job.estimated_hours) continue;
      const [h, m] = job.start_time.split(":").map(Number);
      const startMin = h * 60 + m;
      const endMin = startMin + job.estimated_hours * 60;
      blocks.push({ start: startMin, end: endMin });
    }
    return blocks;
  }, [existingJobs]);

  const timeSlots = useMemo(() => {
    if (!page || !selectedService || !selectedDate) return [];
    const [startH, startM] = page.available_hours_start.split(":").map(Number);
    const [endH, endM] = page.available_hours_end.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const duration = selectedService.duration_minutes;
    const buffer = page.buffer_minutes;
    const slots: string[] = [];

    for (let m = startMinutes; m + duration <= endMinutes; m += duration + buffer) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const timeStr = `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
      
      const slotStart = m;
      const slotEnd = m + duration;

      // Check conflicts with existing booking requests
      const bookingConflict = existingBookings.some(booking => {
        const [bh, bm] = booking.requested_time.split(":").map(Number);
        const bookingStart = bh * 60 + bm;
        const bookingEnd = bookingStart + booking.duration_minutes;
        return slotStart < bookingEnd && slotEnd > bookingStart;
      });

      // Check conflicts with existing jobs (parsed from descriptions)
      const jobConflict = jobTimeBlocks.some(block => {
        return slotStart < block.end && slotEnd > block.start;
      });

      if (!bookingConflict && !jobConflict) {
        slots.push(timeStr);
      }
    }
    return slots;
  }, [page, selectedService, selectedDate, existingBookings, jobTimeBlocks]);

  const isDateAvailable = (date: Date) => {
    if (!page) return false;
    const dayOfWeek = date.getDay();
    if (!page.available_days.includes(dayOfWeek)) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  };

  const handleSubmit = async () => {
    if (!page || !selectedService || !selectedDate || !selectedTime || !clientName || !clientEmail) return;
    setSubmitting(true);
    const { error: err } = await supabase
      .from("booking_requests")
      .insert({
        booking_page_id: page.id,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone || null,
        service_name: selectedService.name,
        requested_date: selectedDate.toISOString().slice(0, 10),
        requested_time: selectedTime,
        duration_minutes: selectedService.duration_minutes,
        price: selectedService.price,
        notes: notes || null,
      });
    setSubmitting(false);
    if (err) {
      return;
    }
    setStep("confirmed");
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-muted/30"><p className="text-muted-foreground">Loading…</p></div>;
  }

  if (error || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-2">
          <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-semibold">Booking Page Not Found</h1>
          <p className="text-muted-foreground text-sm">This booking page may be inactive or doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{page.business_name}</h1>
          <p className="text-muted-foreground text-sm">Book an appointment</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2">
          {["service", "date", "time", "details"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2",
                step === s ? "border-primary bg-primary text-primary-foreground" :
                ["service", "date", "time", "details"].indexOf(step) > i ? "border-primary bg-primary/10 text-primary" :
                "border-muted-foreground/30 text-muted-foreground"
              )}>
                {i + 1}
              </div>
              {i < 3 && <div className="w-8 h-0.5 bg-muted-foreground/20" />}
            </div>
          ))}
        </div>

        {/* Step 1: Select Service */}
        {step === "service" && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <h2 className="font-semibold">Select a Service</h2>
              {page.services.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">No services configured yet.</p>
              ) : (
                page.services.map((svc, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedService(svc); setStep("date"); }}
                    className={cn(
                      "w-full text-left p-4 rounded-lg border transition-colors",
                      selectedService?.name === svc.name
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{svc.name}</span>
                      {svc.price > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <DollarSign className="h-3 w-3" />${svc.price}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <Clock className="h-3.5 w-3.5" />
                      {svc.duration_minutes} minutes
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Pick Date */}
        {step === "date" && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep("service")}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <h2 className="font-semibold">Pick a Date</h2>
                <div className="w-16" />
              </div>
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setSelectedTime("");
                      setStep("time");
                    }
                  }}
                  disabled={(date) => !isDateAvailable(date)}
                  className={cn("p-3 pointer-events-auto")}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Pick Time */}
        {step === "time" && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep("date")}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <h2 className="font-semibold">
                  {selectedDate?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h2>
                <div className="w-16" />
              </div>
              {timeSlots.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No available time slots for this date.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map(slot => (
                    <Button
                      key={slot}
                      variant={selectedTime === slot ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSelectedTime(slot); setStep("details"); }}
                    >
                      {formatTime(slot)}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Contact Details */}
        {step === "details" && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep("time")}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <h2 className="font-semibold">Your Details</h2>
                <div className="w-16" />
              </div>

              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Service:</span> {selectedService?.name}</p>
                <p><span className="text-muted-foreground">Date:</span> {selectedDate?.toLocaleDateString()}</p>
                <p><span className="text-muted-foreground">Time:</span> {formatTime(selectedTime)}</p>
                {selectedService && selectedService.price > 0 && (
                  <p><span className="text-muted-foreground">Price:</span> ${selectedService.price}</p>
                )}
              </div>

              <div className="space-y-3">
                <Input placeholder="Full Name *" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                <Input placeholder="Email *" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                <Input placeholder="Phone (optional)" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
                <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={!clientName || !clientEmail || submitting}
              >
                {submitting ? "Submitting…" : "Confirm Booking"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Confirmation */}
        {step === "confirmed" && (
          <Card>
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
              <h2 className="text-xl font-bold">Booking Request Submitted!</h2>
              <p className="text-muted-foreground">
                We'll review your request and send a confirmation to <strong>{clientEmail}</strong>.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm text-left max-w-xs mx-auto">
                <p><span className="text-muted-foreground">Service:</span> {selectedService?.name}</p>
                <p><span className="text-muted-foreground">Date:</span> {selectedDate?.toLocaleDateString()}</p>
                <p><span className="text-muted-foreground">Time:</span> {formatTime(selectedTime)}</p>
                <p><span className="text-muted-foreground">Name:</span> {clientName}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Powered by Bookie
        </p>
      </div>
    </div>
  );
}
