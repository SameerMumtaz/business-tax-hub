import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SiteLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface RouteJob {
  id: string;
  title: string;
  site_id: string;
  start_time: string | null;
  estimated_hours: number | null;
}

export interface OptimizedRoute {
  originalOrder: { jobId: string; title: string; siteId: string; siteName: string; startTime: string | null }[];
  optimizedOrder: { jobId: string; title: string; siteId: string; siteName: string; suggestedTime: string; travelMinutes: number }[];
  totalOriginalMinutes: number;
  totalOptimizedMinutes: number;
  savingsMinutes: number;
}

/**
 * Nearest-neighbor TSP using real driving time matrix from OpenRouteService.
 */
function solveNearestNeighbor(
  startIdx: number,
  durations: number[][],
  locationCount: number,
): number[] {
  const visited = new Set<number>([startIdx]);
  const order = [startIdx];
  let current = startIdx;

  while (visited.size < locationCount) {
    let bestIdx = -1;
    let bestTime = Infinity;
    for (let i = 0; i < locationCount; i++) {
      if (!visited.has(i) && durations[current][i] < bestTime) {
        bestTime = durations[current][i];
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    visited.add(bestIdx);
    order.push(bestIdx);
    current = bestIdx;
  }

  return order;
}

/**
 * 2-opt improvement on nearest-neighbor solution.
 */
function improve2Opt(order: number[], durations: number[][]): number[] {
  const route = [...order];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const d1 = durations[route[i - 1]][route[i]] + durations[route[j]][route[j === route.length - 1 ? 0 : j + 1] || 0];
        const d2 = durations[route[i - 1]][route[j]] + durations[route[i]][route[j === route.length - 1 ? 0 : j + 1] || 0];
        if (d2 < d1) {
          route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return route;
}

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function useRouteOptimization() {
  const [loading, setLoading] = useState(false);

  /**
   * Fetch driving time matrix from the route-matrix edge function.
   */
  const fetchMatrix = useCallback(
    async (locations: { id: string; lat: number; lng: number }[]) => {
      const { data, error } = await supabase.functions.invoke("route-matrix", {
        body: { locations },
      });
      if (error) throw new Error(error.message || "Failed to fetch route matrix");
      return data as {
        locationIds: string[];
        durations: number[][];
        distances: number[][];
      };
    },
    [],
  );

  /**
   * Get the driving time between two specific locations.
   * Useful for scheduler travel buffers.
   */
  const getTravelTime = useCallback(
    async (
      siteA: { id: string; lat: number; lng: number },
      siteB: { id: string; lat: number; lng: number },
    ): Promise<number> => {
      try {
        const matrix = await fetchMatrix([siteA, siteB]);
        return matrix.durations[0][1]; // minutes from A to B
      } catch {
        return 10; // fallback
      }
    },
    [fetchMatrix],
  );

  /**
   * Compute the optimal route for a crew member's daily jobs.
   */
  const optimizeRoute = useCallback(
    async (
      currentLocation: { lat: number; lng: number } | null,
      jobs: RouteJob[],
      siteMap: Map<string, SiteLocation>,
    ): Promise<OptimizedRoute | null> => {
      if (jobs.length < 2) {
        toast.error("Need at least 2 jobs to optimize a route");
        return null;
      }

      setLoading(true);
      try {
        // Build unique locations: current position + unique job sites
        const locations: { id: string; lat: number; lng: number }[] = [];
        const siteJobMap = new Map<string, RouteJob[]>();

        // Add current position as starting point (index 0)
        if (currentLocation) {
          locations.push({ id: "current", lat: currentLocation.lat, lng: currentLocation.lng });
        }

        // Add unique sites
        const addedSites = new Set<string>();
        for (const job of jobs) {
          const site = siteMap.get(job.site_id);
          if (!site || !site.lat || !site.lng) {
            toast.error(`Site "${site?.name || job.site_id}" is missing GPS coordinates`);
            setLoading(false);
            return null;
          }
          if (!addedSites.has(job.site_id)) {
            addedSites.add(job.site_id);
            locations.push({ id: job.site_id, lat: site.lat, lng: site.lng });
          }
          const existing = siteJobMap.get(job.site_id) || [];
          existing.push(job);
          siteJobMap.set(job.site_id, existing);
        }

        // Fetch real driving times
        const matrix = await fetchMatrix(locations);

        // Solve TSP starting from current position (or first site)
        const startIdx = currentLocation ? 0 : 0;
        const siteIndices = currentLocation
          ? Array.from({ length: locations.length - 1 }, (_, i) => i + 1)
          : Array.from({ length: locations.length }, (_, i) => i);

        // Build sub-matrix for sites only, but use start point for first leg
        let optimalOrder: number[];
        if (currentLocation) {
          // NN from current location through all sites
          optimalOrder = solveNearestNeighbor(0, matrix.durations, locations.length);
          optimalOrder = improve2Opt(optimalOrder, matrix.durations);
          // Remove the "current" position from the order
          optimalOrder = optimalOrder.filter((i) => i !== 0);
        } else {
          optimalOrder = solveNearestNeighbor(0, matrix.durations, locations.length);
          optimalOrder = improve2Opt(optimalOrder, matrix.durations);
        }

        // Calculate original travel time
        const originalSiteOrder = jobs.map((j) => {
          const idx = matrix.locationIds.indexOf(j.site_id);
          return idx;
        });

        let totalOriginalMinutes = 0;
        const origStart = currentLocation ? 0 : originalSiteOrder[0];
        let prevIdx = origStart;
        const seenOrigSites: number[] = [];
        for (const idx of originalSiteOrder) {
          if (!seenOrigSites.includes(idx)) {
            totalOriginalMinutes += matrix.durations[prevIdx][idx];
            prevIdx = idx;
            seenOrigSites.push(idx);
          }
        }

        // Calculate optimized travel time
        let totalOptimizedMinutes = 0;
        const optStart = currentLocation ? 0 : optimalOrder[0];
        prevIdx = optStart;
        for (const idx of optimalOrder) {
          totalOptimizedMinutes += matrix.durations[prevIdx][idx];
          prevIdx = idx;
        }

        // Build the optimized job order with suggested times
        const optimizedJobs: OptimizedRoute["optimizedOrder"] = [];
        const firstJobTime = jobs[0]?.start_time || "08:00";
        let currentMinutes = timeToMinutes(firstJobTime);

        // Handle travel from current location to first site
        if (currentLocation && optimalOrder.length > 0) {
          currentMinutes += matrix.durations[0][optimalOrder[0]];
          // Snap to next 5-minute mark
          currentMinutes = Math.ceil(currentMinutes / 5) * 5;
        }

        for (let i = 0; i < optimalOrder.length; i++) {
          const locIdx = optimalOrder[i];
          const siteId = matrix.locationIds[locIdx];
          const site = siteMap.get(siteId);
          const siteJobs = siteJobMap.get(siteId) || [];

          // Travel time from previous stop
          const travelMinutes = i > 0
            ? matrix.durations[optimalOrder[i - 1]][locIdx]
            : (currentLocation ? matrix.durations[0][locIdx] : 0);

          if (i > 0) {
            currentMinutes += travelMinutes;
            // Snap to 5-minute increments
            currentMinutes = Math.ceil(currentMinutes / 5) * 5;
          }

          // Schedule all jobs at this site sequentially
          for (const job of siteJobs) {
            optimizedJobs.push({
              jobId: job.id,
              title: job.title,
              siteId,
              siteName: site?.name || "Unknown",
              suggestedTime: minutesToTime(currentMinutes),
              travelMinutes: optimizedJobs.length === 0 ? travelMinutes : (siteJobs.indexOf(job) === 0 ? travelMinutes : 0),
            });
            currentMinutes += (job.estimated_hours || 1) * 60;
          }
        }

        // Build original order
        const originalOrder = jobs.map((j) => ({
          jobId: j.id,
          title: j.title,
          siteId: j.site_id,
          siteName: siteMap.get(j.site_id)?.name || "Unknown",
          startTime: j.start_time,
        }));

        const result: OptimizedRoute = {
          originalOrder,
          optimizedOrder: optimizedJobs,
          totalOriginalMinutes: Math.round(totalOriginalMinutes),
          totalOptimizedMinutes: Math.round(totalOptimizedMinutes),
          savingsMinutes: Math.round(totalOriginalMinutes - totalOptimizedMinutes),
        };

        setLoading(false);
        return result;
      } catch (err: any) {
        console.error("Route optimization error:", err);
        toast.error(err.message || "Failed to optimize route");
        setLoading(false);
        return null;
      }
    },
    [fetchMatrix],
  );

  /**
   * Submit a route optimization request for manager approval.
   */
  const submitRequest = useCallback(
    async (
      crewMemberId: string,
      businessUserId: string,
      requestDate: string,
      currentLat: number | null,
      currentLng: number | null,
      route: OptimizedRoute,
    ) => {
      const { error } = await supabase.from("route_optimization_requests").insert({
        crew_member_id: crewMemberId,
        business_user_id: businessUserId,
        request_date: requestDate,
        current_lat: currentLat,
        current_lng: currentLng,
        original_order: route.originalOrder as any,
        optimized_order: route.optimizedOrder as any,
        total_original_minutes: route.totalOriginalMinutes,
        total_optimized_minutes: route.totalOptimizedMinutes,
        estimated_savings_minutes: route.savingsMinutes,
        status: "pending",
      } as any);

      if (error) {
        console.error("Submit route request error:", error);
        toast.error("Failed to submit route request");
        return false;
      }

      // Notify the business owner
      await supabase.from("notifications").insert({
        user_id: businessUserId,
        title: "Route Optimization Request",
        message: `A crew member has requested an optimized route for ${requestDate}. Estimated savings: ${route.savingsMinutes} minutes.`,
        type: "info",
        metadata: { type: "route_optimization" },
      } as any);

      toast.success("Route optimization request sent for approval!");
      return true;
    },
    [],
  );

  return { loading, fetchMatrix, getTravelTime, optimizeRoute, submitRequest };
}
