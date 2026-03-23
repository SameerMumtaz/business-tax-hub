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

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const invitedBy = user.user_metadata?.invited_by;

    let updateQuery = adminClient
      .from("team_members")
      .update({
        member_user_id: user.id,
        status: "active",
        accepted_at: new Date().toISOString(),
      })
      .eq("email", user.email)
      .eq("status", "invited")
      .is("member_user_id", null);

    if (typeof invitedBy === "string" && invitedBy.length > 0) {
      updateQuery = updateQuery.eq("business_user_id", invitedBy);
    }

    const { data, error } = await updateQuery.select("id, business_user_id, role, name, worker_type");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-populate crew member's profile with admin-provided info
    if (data && data.length > 0) {
      for (const tm of data) {
        const nameParts = (tm.name || "").trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        // Get address info from contractor/employee records
        let address: string | null = null;
        let stateEmployed: string | null = null;
        let ssnLast4: string | null = null;

        if (tm.worker_type === "1099") {
          const { data: contractor } = await adminClient
            .from("contractors")
            .select("address, state_employed, tin_last4")
            .eq("user_id", tm.business_user_id)
            .eq("name", tm.name)
            .maybeSingle();
          if (contractor) {
            address = contractor.address;
            stateEmployed = contractor.state_employed;
            ssnLast4 = contractor.tin_last4;
          }
        } else {
          const { data: employee } = await adminClient
            .from("employees")
            .select("address, state_employed, ssn_last4")
            .eq("user_id", tm.business_user_id)
            .eq("name", tm.name)
            .maybeSingle();
          if (employee) {
            address = employee.address;
            stateEmployed = employee.state_employed;
            ssnLast4 = employee.ssn_last4;
          }
        }

        // Update the crew member's profile with available info
        const profileUpdate: Record<string, string | null> = {};
        if (firstName) profileUpdate.first_name = firstName;
        if (lastName) profileUpdate.last_name = lastName;
        if (address) profileUpdate.personal_address = address;
        if (stateEmployed) profileUpdate.personal_state = stateEmployed;
        if (ssnLast4) profileUpdate.ssn_last4 = ssnLast4;

        if (Object.keys(profileUpdate).length > 0) {
          await adminClient
            .from("profiles")
            .update(profileUpdate)
            .eq("user_id", user.id);
        }
      }
    }

    // Notify business owner(s) that a team member joined
    if (data && data.length > 0) {
      for (const tm of data) {
        await adminClient.from("notifications").insert({
          user_id: tm.business_user_id,
          title: "Team member joined",
          message: `${tm.name || user.email} has accepted the invite and joined as ${tm.role}.`,
          type: "team_join",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, activated: data?.length || 0, team_members: data || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
