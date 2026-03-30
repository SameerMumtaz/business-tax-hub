import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Location {
  id: string;
  lat: number;
  lng: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("route-matrix: request received");

    // Validate JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("route-matrix: missing or invalid auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.log("route-matrix: auth failed", claimsError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("route-matrix: authenticated user", claimsData.claims.sub);

    const body = await req.json();
    const locations: Location[] = body.locations;
    console.log("route-matrix: received", locations?.length, "locations");

    if (!locations || !Array.isArray(locations) || locations.length < 2) {
      return new Response(JSON.stringify({ error: "At least 2 locations required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (locations.length > 25) {
      return new Response(JSON.stringify({ error: "Maximum 25 locations supported" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate all locations have valid coords
    for (const loc of locations) {
      if (typeof loc.lat !== "number" || typeof loc.lng !== "number" ||
          loc.lat < -90 || loc.lat > 90 || loc.lng < -180 || loc.lng > 180) {
        return new Response(JSON.stringify({ error: `Invalid coordinates for location ${loc.id}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const orsKey = Deno.env.get("OPENROUTE_API_KEY");
    if (!orsKey) {
      return new Response(JSON.stringify({ error: "OpenRouteService API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call OpenRouteService matrix API
    // ORS expects [lng, lat] order
    const orsLocations = locations.map((l) => [l.lng, l.lat]);

    const orsResponse = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
      method: "POST",
      headers: {
        Authorization: orsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locations: orsLocations,
        metrics: ["duration", "distance"],
        units: "mi",
      }),
    });

    if (!orsResponse.ok) {
      const errText = await orsResponse.text();
      console.error("ORS error:", orsResponse.status, errText);
      return new Response(JSON.stringify({ error: `Route service error: ${orsResponse.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orsData = await orsResponse.json();

    // durations are in seconds, convert to minutes
    const durationMatrix: number[][] = orsData.durations.map((row: number[]) =>
      row.map((v: number) => Math.round(v / 60 * 10) / 10)
    );
    const distanceMatrix: number[][] = orsData.distances;

    // Return location IDs mapped to indices for easy consumption
    return new Response(
      JSON.stringify({
        locationIds: locations.map((l) => l.id),
        durations: durationMatrix,   // minutes
        distances: distanceMatrix,   // miles
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("route-matrix error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
