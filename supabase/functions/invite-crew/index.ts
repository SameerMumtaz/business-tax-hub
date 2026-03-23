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
        .select("id, status")
        .eq("email", email)
        .eq("business_user_id", business_user_id)
        .maybeSingle();

      if (existing) {
        if (existing.status === "active") {
          return new Response(
            JSON.stringify({ error: "This team member is already active" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // If previously invited but not yet active, just return success —
        // the user can sign up normally and will be auto-linked.
        return new Response(
          JSON.stringify({ success: true, message: "This email was already invited. They can sign up at the app to join your team." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (resend) {
      // Check if user already has an auth account
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = authUsers?.users?.find((u: any) => u.email === email);

      if (existingAuthUser) {
        // User already has an account — send a password reset so they can get in
        const { error: resetErr } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovableproject.com') || 'http://localhost:5173'}/reset-password` },
        });
        if (resetErr) {
          return new Response(
            JSON.stringify({ error: `Failed to send reset email: ${resetErr.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, message: "A password reset email has been sent to the team member." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // No auth account — send an invite email which creates their account
        const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovableproject.com') || 'http://localhost:5173'}/reset-password`,
        });
        if (inviteErr) {
          // If user was somehow created between checks, still succeed
          if (inviteErr.message?.includes("already been registered") || inviteErr.message?.includes("already invited")) {
            return new Response(
              JSON.stringify({ success: true, message: "This user already has an account. Please ask them to sign in or reset their password." }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ error: `Failed to send invite: ${inviteErr.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update team_members record with the new auth user ID if available
        const { data: newUsers } = await adminClient.auth.admin.listUsers();
        const newUser = newUsers?.users?.find((u: any) => u.email === email);
        if (newUser) {
          await adminClient
            .from("team_members")
            .update({ member_user_id: newUser.id })
            .eq("email", email)
            .eq("business_user_id", business_user_id);
        }

        return new Response(
          JSON.stringify({ success: true, message: "Invite email sent! The team member will receive an email to set up their account." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
