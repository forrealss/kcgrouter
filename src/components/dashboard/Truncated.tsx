import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TruncatedProps {
  /** Full text; shown in the tooltip and truncated inline. */
  text: string;
  /** Optional extra detail appended in the tooltip on its own line. */
  detail?: ReactNode;
  className?: string;
}

/**
 * Single-line truncated text with a keyboard-accessible tooltip carrying the
 * full value. Uses a real button as the trigger so keyboard and screen-reader
 * users can reach it, unlike a plain `title` attribute.
 */
export function Truncated({ text, detail, className }: TruncatedProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "block min-w-0 max-w-full cursor-default truncate text-left",
            "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring/50",
            className,
          )}
        >
          {text}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">
        <span className="font-mono">{text}</span>
        {detail ? (
          <span className="mt-1 block text-background/70">{detail}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
