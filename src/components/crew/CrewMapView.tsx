import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, ExternalLink } from "lucide-react";
import type { AssignedJob } from "./CrewJobsList";

interface Props {
  jobs: AssignedJob[];
}

export default function CrewMapView({ jobs }: Props) {
  // Deduplicate sites
  const siteMap = new Map<string, { site: AssignedJob["site"]; jobs: AssignedJob[] }>();
  jobs.forEach((job) => {
    if (!siteMap.has(job.site.id)) {
      siteMap.set(job.site.id, { site: job.site, jobs: [] });
    }
    siteMap.get(job.site.id)!.jobs.push(job);
  });

  const sites = Array.from(siteMap.values());
  const sitesWithCoords = sites.filter((s) => s.site.latitude != null && s.site.longitude != null);

  // Build a static map URL using OpenStreetMap embed
  const getDirectionsUrl = (lat: number | null, lng: number | null, address: string | null) => {
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }
    if (address) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    }
    return null;
  };

  const getMapEmbedUrl = () => {
    if (sitesWithCoords.length === 0) return null;
    // Center on first site, show all markers
    const markers = sitesWithCoords
      .map((s) => `${s.site.latitude},${s.site.longitude}`)
      .join("|");
    const center = sitesWithCoords[0];
    return `https://www.openstreetmap.org/export/embed.html?bbox=${getBBox()}&layer=mapnik&marker=${center.site.latitude},${center.site.longitude}`;
  };

  const getBBox = () => {
    if (sitesWithCoords.length === 0) return "";
    const lats = sitesWithCoords.map((s) => s.site.latitude!);
    const lngs = sitesWithCoords.map((s) => s.site.longitude!);
    const pad = 0.02;
    return `${Math.min(...lngs) - pad},${Math.min(...lats) - pad},${Math.max(...lngs) + pad},${Math.max(...lats) + pad}`;
  };

  const mapUrl = getMapEmbedUrl();

  return (
    <div className="space-y-4">
      {mapUrl && (
        <Card className="overflow-hidden">
          <iframe
            src={mapUrl}
            className="w-full h-64 border-0"
            title="Job Sites Map"
          />
        </Card>
      )}

      {sites.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-muted-foreground">No job sites to display</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sites.map(({ site, jobs: siteJobs }) => {
            const directionsUrl = getDirectionsUrl(site.latitude, site.longitude, site.address);
            return (
              <Card key={site.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{site.name}</h3>
                      {site.address && (
                        <p className="text-xs text-muted-foreground">{site.address}</p>
                      )}
                    </div>
                    {directionsUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                          <Navigation className="h-3.5 w-3.5" />
                          Directions
                        </a>
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {siteJobs.length} job{siteJobs.length !== 1 ? "s" : ""}: {siteJobs.map((j) => j.title).join(", ")}
                  </div>
                  {site.latitude != null && (
                    <div className="text-[10px] text-muted-foreground/60">
                      {site.latitude.toFixed(5)}, {site.longitude?.toFixed(5)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
