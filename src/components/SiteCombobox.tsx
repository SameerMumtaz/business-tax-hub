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
}

export default function SiteCombobox({ sites, value, onSelect, onAddNew, placeholder = "Select site" }: SiteComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSite = sites.find(s => s.id === value);

  const filtered = useMemo(() => {
    if (!search) return sites;
    const q = search.toLowerCase();
    return sites.filter(s =>
      [s.name, s.address, s.city, s.state].some(f => f?.toLowerCase().includes(q))
    );
  }, [sites, search]);

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
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No sites found</p>
          )}
          {filtered.map(s => (
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
          ))}
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
