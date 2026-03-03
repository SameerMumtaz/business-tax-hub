import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HelpTooltipProps {
  text: string;
  className?: string;
}

export default function HelpTooltip({ text, className = "" }: HelpTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className={`h-3.5 w-3.5 text-muted-foreground cursor-help inline-block ml-1 ${className}`} />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
