import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { JobSite } from "@/hooks/useJobs";

interface SiteComboboxProps {
  sites: JobSite[];
  value: string;
  onSelect: (siteId: string) => void;
  onAddNew?: () => void;
  placeholder?: string;
  /** When set, shows this client's sites first with a separator, then other matches */
  clientId?: string;
}

export default function SiteCombobox({ sites, value, onSelect, onAddNew, placeholder = "Select site", clientId }: SiteComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSite = sites.find(s => s.id === value);

  const matchesSearch = (s: JobSite) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [s.name, s.address, s.city, s.state].some(f => f?.toLowerCase().includes(q));
  };

  const { clientSites, otherSites } = useMemo(() => {
    if (!clientId) {
      return { clientSites: [], otherSites: sites.filter(matchesSearch) };
    }
    const client: JobSite[] = [];
    const other: JobSite[] = [];
    for (const s of sites) {
      if (!matchesSearch(s)) continue;
      if (s.client_id === clientId) client.push(s);
      else other.push(s);
    }
    return { clientSites: client, otherSites: other };
  }, [sites, search, clientId]);

  const renderItem = (s: JobSite) => (
    <button
      key={s.id}
      onClick={() => { onSelect(s.id); setOpen(false); setSearch(""); }}
      className={cn(
        "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer text-left",
        value === s.id && "bg-accent"
      )}
    >
      <Check className={cn("h-4 w-4 shrink-0", value === s.id ? "opacity-100" : "opacity-0")} />
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate block">{s.name}</span>
        {(s.address || s.city) && (
          <span className="text-xs text-muted-foreground truncate block">
            {[s.address, s.city, s.state].filter(Boolean).join(", ")}
          </span>
        )}
      </div>
    </button>
  );

  const hasResults = clientSites.length > 0 || otherSites.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selectedSite && "text-muted-foreground")}>
            {selectedSite ? selectedSite.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sites…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[220px] overflow-y-auto px-1 pb-1">
          {!hasResults && (
            <p className="text-sm text-muted-foreground text-center py-4">No sites found</p>
          )}
          {clientSites.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground px-2 py-1">Client sites</p>
              {clientSites.map(renderItem)}
              {otherSites.length > 0 && (
                <div className="border-t my-1" />
              )}
            </>
          )}
          {otherSites.length > 0 && (
            <>
              {clientId && clientSites.length > 0 && (
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">Other sites</p>
              )}
              {otherSites.map(renderItem)}
            </>
          )}
        </div>
        {onAddNew && (
          <div className="border-t p-1">
            <button
              onClick={() => { onAddNew(); setOpen(false); setSearch(""); }}
              className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm text-primary font-medium hover:bg-accent cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add New Site
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
