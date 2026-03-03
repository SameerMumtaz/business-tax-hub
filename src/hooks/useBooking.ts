import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface BookingService {
  name: string;
  duration_minutes: number;
  price: number;
}

export interface BookingPage {
  id: string;
  user_id: string;
  slug: string;
  business_name: string;
  services: BookingService[];
  available_days: number[];
  available_hours_start: string;
  available_hours_end: string;
  buffer_minutes: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingRequest {
  id: string;
  booking_page_id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  service_name: string;
  requested_date: string;
  requested_time: string;
  duration_minutes: number;
  price: number;
  notes: string | null;
  status: "pending" | "confirmed" | "declined";
  created_at: string;
}

export function useBookingPage() {
  const { user } = useAuth();
  const [page, setPage] = useState<BookingPage | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPage = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("booking_pages")
      .select("*")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (data) {
      setPage({
        ...data,
        services: (data.services as any) || [],
        available_days: data.available_days || [1, 2, 3, 4, 5],
      } as BookingPage);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPage();
  }, [user]);

  const createPage = async (slug: string, businessName: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("booking_pages")
      .insert({
        user_id: user.id,
        slug,
        business_name: businessName,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message.includes("duplicate") ? "This URL slug is already taken" : error.message);
      return;
    }
    setPage({ ...data, services: [], available_days: data.available_days || [1, 2, 3, 4, 5] } as BookingPage);
    toast.success("Booking page created");
  };

  const updatePage = async (updates: Partial<BookingPage>) => {
    if (!page) return;
    const { error } = await supabase
      .from("booking_pages")
      .update(updates as any)
      .eq("id", page.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPage({ ...page, ...updates } as BookingPage);
    toast.success("Settings saved");
  };

  return { page, loading, createPage, updatePage, refetch: fetchPage };
}

export function useBookingRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    if (!user) return;
    setLoading(true);
    // Get user's booking page first
    const { data: pages } = await supabase
      .from("booking_pages")
      .select("id")
      .eq("user_id", user.id);
    
    if (!pages?.length) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const pageIds = pages.map(p => p.id);
    const { data } = await supabase
      .from("booking_requests")
      .select("*")
      .in("booking_page_id", pageIds)
      .order("created_at", { ascending: false });
    
    setRequests((data || []) as BookingRequest[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [user]);

  const updateStatus = async (id: string, status: "confirmed" | "declined") => {
    const { error } = await supabase
      .from("booking_requests")
      .update({ status })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update status");
      return false;
    }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    toast.success(`Booking ${status}`);
    return true;
  };

  return { requests, loading, updateStatus, refetch: fetchRequests };
}
