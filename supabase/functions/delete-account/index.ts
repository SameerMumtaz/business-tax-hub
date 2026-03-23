import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { action, target_user_id, team_member_id, deletion_request_id } = await req.json();

    // ACTION: self-delete — business owner or personal account deletes themselves
    if (action === "self_delete") {
      // Delete all user data across tables
      const tables = [
        "deletion_requests", "pay_rate_changes", "crew_checkins", "job_assignments",
        "timesheet_entries", "job_expenses", "job_photos", "vehicle_expenses",
        "vehicle_payments", "invoice_line_items", "invoice_payments", "quote_line_items",
        "sales_tax_filings", "reconciliation_periods", "audit_dismissals",
        "categorization_rules", "quarterly_tax_payments", "personal_deductions",
        "personal_expenses", "w2_income", "booking_requests",
      ];

      // Delete team members where user is business owner
      await adminClient.from("team_members").delete().eq("business_user_id", user.id);
      // Delete team members where user is a member (by user_id and by email)
      await adminClient.from("team_members").delete().eq("member_user_id", user.id);
      if (user.email) {
        await adminClient.from("team_members").delete().eq("email", user.email).is("member_user_id", null);
      }

      // Delete booking pages (and their requests via cascade)
      await adminClient.from("booking_pages").delete().eq("user_id", user.id);

      // Delete dependent records first
      const { data: invoices } = await adminClient.from("invoices").select("id").eq("user_id", user.id);
      if (invoices?.length) {
        const invoiceIds = invoices.map(i => i.id);
        await adminClient.from("invoice_line_items").delete().in("invoice_id", invoiceIds);
        await adminClient.from("invoice_payments").delete().in("invoice_id", invoiceIds);
      }

      const { data: quotes } = await adminClient.from("quotes").select("id").eq("user_id", user.id);
      if (quotes?.length) {
        await adminClient.from("quote_line_items").delete().in("quote_id", quotes.map(q => q.id));
      }

      const { data: jobs } = await adminClient.from("jobs").select("id").eq("user_id", user.id);
      if (jobs?.length) {
        const jobIds = jobs.map(j => j.id);
        await adminClient.from("job_assignments").delete().in("job_id", jobIds);
        await adminClient.from("job_expenses").delete().in("job_id", jobIds);
        await adminClient.from("job_photos").delete().in("job_id", jobIds);
      }

      const { data: vehicles } = await adminClient.from("vehicles").select("id").eq("user_id", user.id);
      if (vehicles?.length) {
        const vehicleIds = vehicles.map(v => v.id);
        await adminClient.from("vehicle_expenses").delete().in("vehicle_id", vehicleIds);
        await adminClient.from("vehicle_payments").delete().in("vehicle_id", vehicleIds);
      }

      // Delete main tables
      const mainTables = [
        "sales", "expenses", "invoices", "quotes", "jobs", "job_sites",
        "clients", "contractors", "employees", "vehicles", "timesheets",
        "sales_tax_filings", "reconciliation_periods", "audit_dismissals",
        "categorization_rules", "quarterly_tax_payments", "personal_deductions",
        "personal_expenses", "w2_income",
      ];
      for (const table of mainTables) {
        await adminClient.from(table).delete().eq("user_id", user.id);
      }

      // Delete profile
      await adminClient.from("profiles").delete().eq("user_id", user.id);

      // Delete auth user
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id);
      if (deleteErr) {
        return new Response(JSON.stringify({ error: `Failed to delete account: ${deleteErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Account deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: approve_deletion — admin/manager approves a deletion request
    if (action === "approve_deletion" && deletion_request_id) {
      const { data: request } = await adminClient
        .from("deletion_requests")
        .select("*, team_members!inner(role, business_user_id, member_user_id, name, worker_type)")
        .eq("id", deletion_request_id)
        .single();

      if (!request) {
        return new Response(JSON.stringify({ error: "Request not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tm = (request as any).team_members;

      // Verify permissions: admin can delete anyone, manager can only delete crew
      const { data: callerRole } = await adminClient
        .from("team_members")
        .select("role")
        .eq("member_user_id", user.id)
        .eq("business_user_id", request.business_user_id)
        .eq("status", "active")
        .maybeSingle();

      const isBusinessOwner = user.id === request.business_user_id;
      const isManager = callerRole?.role === "manager";

      if (!isBusinessOwner && !isManager) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isManager && tm.role !== "crew") {
        return new Response(JSON.stringify({ error: "Managers can only approve crew deletion requests" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Clean up associated records
      await adminClient.from("pay_rate_changes").delete().eq("team_member_id", request.team_member_id);
      await adminClient.from("crew_checkins").delete().eq("team_member_id", request.team_member_id);

      // Remove contractor/employee record
      if (tm.worker_type === "1099") {
        await adminClient.from("contractors").delete().eq("user_id", request.business_user_id).eq("name", tm.name);
      } else {
        await adminClient.from("employees").delete().eq("user_id", request.business_user_id).eq("name", tm.name);
      }

      // Delete team member record
      await adminClient.from("team_members").delete().eq("id", request.team_member_id);

      // Update request status
      await adminClient.from("deletion_requests").update({
        status: "approved",
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      }).eq("id", deletion_request_id);

      return new Response(JSON.stringify({ success: true, message: "Member removed successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: reject_deletion
    if (action === "reject_deletion" && deletion_request_id) {
      await adminClient.from("deletion_requests").update({
        status: "rejected",
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      }).eq("id", deletion_request_id);

      return new Response(JSON.stringify({ success: true, message: "Request rejected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
