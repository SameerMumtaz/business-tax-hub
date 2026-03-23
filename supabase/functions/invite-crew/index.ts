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

    // Fetch business profile to get Bookie ID for the invite email
    const bizAdminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: bizProfile } = await bizAdminClient
      .from("profiles")
      .select("bookie_id, business_name")
      .eq("user_id", business_user_id)
      .single();
    const bookieId = bizProfile?.bookie_id || "";
    const businessName = bizProfile?.business_name || "your team";

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
    const appUrl =
      Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovableproject.com") ||
      "http://localhost:5173";

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
          // Check if the auth user still exists — if deleted, allow re-invite
          const { data: authUsers } = await adminClient.auth.admin.listUsers();
          const authUserExists = existing.member_user_id && authUsers?.users?.some((u: any) => u.id === existing.member_user_id);
          if (authUserExists) {
            return new Response(
              JSON.stringify({ error: "This team member is already active" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          // Auth user was deleted — remove stale record so we can re-invite
          await adminClient.from("team_members").delete().eq("id", existing.id);
        } else {
          // Check if auth user was deleted for invited records too
          if (existing.member_user_id) {
            const { data: authUsers } = await adminClient.auth.admin.listUsers();
            const authUserExists = authUsers?.users?.some((u: any) => u.id === existing.member_user_id);
            if (!authUserExists) {
              // Stale record — delete and allow re-invite
              await adminClient.from("team_members").delete().eq("id", existing.id);
            } else {
              return new Response(
                JSON.stringify({ success: true, message: `This email was already invited. They can sign up at the app and use Bookie ID ${bookieId || "(not set)"} to join your team.` }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          } else {
            // No member_user_id — stale orphan record, delete and allow re-invite
            await adminClient.from("team_members").delete().eq("id", existing.id);
          }
        }
      }
    }

    if (resend) {
      const { data: existingRecord } = await adminClient
        .from("team_members")
        .select("id, status, accepted_at, member_user_id")
        .eq("email", email)
        .eq("business_user_id", business_user_id)
        .maybeSingle();

      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = authUsers?.users?.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      );
      const linkedUserStillExists = existingRecord?.member_user_id
        ? authUsers?.users?.some((u: any) => u.id === existingRecord.member_user_id)
        : false;

      if (existingRecord?.member_user_id && !linkedUserStillExists) {
        await adminClient
          .from("team_members")
          .update({
            member_user_id: null,
            status: "invited",
            accepted_at: null,
            invited_at: new Date().toISOString(),
          })
          .eq("id", existingRecord.id);
      }

      if (existingAuthUser && existingRecord?.status !== "active" && !existingRecord?.accepted_at) {
        const { error: deleteInvitedAuthErr } = await adminClient.auth.admin.deleteUser(existingAuthUser.id);
        if (!deleteInvitedAuthErr) {
          await adminClient
            .from("team_members")
            .update({
              member_user_id: null,
              status: "invited",
              accepted_at: null,
              invited_at: new Date().toISOString(),
            })
            .eq("id", existingRecord.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Invite refreshed. No account was pre-created. Ask them to sign up with this email and use Bookie ID ${bookieId || "(not set)"}.`,
        }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (existingAuthUser) {
        const { error: resetErr } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${appUrl}/reset-password` },
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
      }

      if (existingRecord) {
        await adminClient
          .from("team_members")
          .update({
            member_user_id: null,
            status: "invited",
            accepted_at: null,
            invited_at: new Date().toISOString(),
          })
          .eq("id", existingRecord.id);
      }

      const signupLink = bookieId
        ? `${appUrl}/auth?invite=${encodeURIComponent(bookieId)}`
        : `${appUrl}/auth`;

      return new Response(
        JSON.stringify({
          success: true,
          message: `Invite refreshed. The user can sign up at: ${signupLink}`,
          signupLink,
          bookieId: bookieId || null,
        }),
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

    // Notify the business owner that an invite was sent
    if (user.id !== business_user_id) {
      await adminClient.from("notifications").insert({
        user_id: business_user_id,
        title: "Team invite sent",
        message: `${name} (${email}) was invited as ${role} by a manager.`,
        type: "team_invite",
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
          : `Team member invited! Share this signup link: ${bookieId ? `${appUrl}/auth?invite=${encodeURIComponent(bookieId)}` : appUrl}${bookieId ? ` (Bookie ID: ${bookieId})` : ""}`,
        signupLink: bookieId ? `${appUrl}/auth?invite=${encodeURIComponent(bookieId)}` : appUrl,
        bookieId: bookieId || null,
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
