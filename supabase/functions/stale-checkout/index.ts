import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STALE_MINUTES = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

    // Find all active check-ins where last_seen_at is older than cutoff
    const { data: stale, error: fetchErr } = await supabase
      .from("crew_checkins")
      .select("id, check_in_time, last_seen_at, team_member_id")
      .eq("status", "checked_in")
      .lt("last_seen_at", cutoff);

    if (fetchErr) {
      console.error("Error fetching stale checkins:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!stale || stale.length === 0) {
      return new Response(JSON.stringify({ checked_out: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let checkedOut = 0;

    for (const checkin of stale) {
      const checkOutTime = new Date();
      const checkInTime = new Date(checkin.check_in_time);
      const totalHours =
        Math.round(
          ((checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) * 100
        ) / 100;

      const { error: updateErr } = await supabase
        .from("crew_checkins")
        .update({
          check_out_time: checkOutTime.toISOString(),
          total_hours: totalHours,
          status: "checked_out",
          flag_reason: `Auto-checkout: no client ping for ${STALE_MINUTES}+ minutes (last seen ${checkin.last_seen_at})`,
        })
        .eq("id", checkin.id)
        .eq("status", "checked_in"); // Prevent race condition

      if (!updateErr) checkedOut++;
    }

    console.log(`Stale checkout: processed ${stale.length}, checked out ${checkedOut}`);

    return new Response(JSON.stringify({ checked_out: checkedOut, processed: stale.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Stale checkout error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
