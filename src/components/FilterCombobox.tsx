import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FilterOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface FilterComboboxProps {
  options: FilterOption[];
  value: string;
  onSelect: (value: string) => void;
  allLabel?: string;
  placeholder?: string;
  className?: string;
}

export default function FilterCombobox({
  options,
  value,
  onSelect,
  allLabel = "All",
  placeholder = "Search…",
  className,
}: FilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.sublabel?.toLowerCase().includes(q)
    );
  }, [options, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-8 justify-between font-normal text-xs", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : allLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[220px] overflow-y-auto px-1 pb-1">
          <button
            onClick={() => { onSelect("all"); setOpen(false); setSearch(""); }}
            className={cn(
              "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-xs hover:bg-accent cursor-pointer text-left",
              value === "all" && "bg-accent"
            )}
          >
            <Check className={cn("h-3.5 w-3.5 shrink-0", value === "all" ? "opacity-100" : "opacity-0")} />
            {allLabel}
          </button>
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">No results</p>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              onClick={() => { onSelect(o.value); setOpen(false); setSearch(""); }}
              className={cn(
                "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-xs hover:bg-accent cursor-pointer text-left",
                value === o.value && "bg-accent"
              )}
            >
              <Check className={cn("h-3.5 w-3.5 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{o.label}</span>
                {o.sublabel && (
                  <span className="text-[11px] text-muted-foreground truncate block">{o.sublabel}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
