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
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, name, role, business_user_id, worker_type, pay_rate, address, state_employed, resend } = await req.json();

    if (user.id !== business_user_id) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: membership } = await adminClient
        .from("team_members")
        .select("role")
        .eq("member_user_id", user.id)
        .eq("business_user_id", business_user_id)
        .eq("status", "active")
        .single();

      if (!membership || (membership.role === "manager" && role !== "crew")) {
        return new Response(
          JSON.stringify({ error: "Insufficient permissions" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if already invited (skip for resend)
    if (!resend) {
      const { data: existing } = await adminClient
        .from("team_members")
        .select("id")
        .eq("email", email)
        .eq("business_user_id", business_user_id)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "This email has already been invited" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (resend) {
      // For resend, just confirm the record exists — user signs up on their own
      return new Response(
        JSON.stringify({ success: true, message: "Please share the signup link with the team member." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists in auth (they may have signed up already)
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u: any) => u.email === email
    );

    let memberUserId = existingUser?.id || null;
    let memberStatus = existingUser ? "active" : "invited";

    // Do NOT call inviteUserByEmail — let the user sign up on their own.
    // The accept-team-invite function will link them when they sign in.

    // Create team_members row with worker_type and pay_rate
    const { data: teamMember, error: insertError } = await adminClient
      .from("team_members")
      .insert({
        business_user_id,
        member_user_id: memberUserId,
        role,
        name,
        email,
        status: memberStatus,
        accepted_at: existingUser ? new Date().toISOString() : null,
        worker_type: worker_type || "1099",
        pay_rate: pay_rate || 0,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-create a contractor or employee record for the business owner
    if (worker_type === "W2") {
      await adminClient.from("employees").insert({
        user_id: business_user_id,
        name,
        salary: pay_rate || 0,
        address: address || null,
        state_employed: state_employed || null,
        federal_withholding: 0,
        state_withholding: 0,
        social_security: 0,
        medicare: 0,
      });
    } else {
      await adminClient.from("contractors").insert({
        user_id: business_user_id,
        name,
        pay_rate: pay_rate || 0,
        total_paid: 0,
        address: address || null,
        state_employed: state_employed || null,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: existingUser
          ? "User added to team"
          : "Team member record created. They can sign up at the app and will be automatically linked.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
