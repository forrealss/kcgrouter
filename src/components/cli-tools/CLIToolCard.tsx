import { ArrowUpRightIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cliToolStateMeta, resolveCLIToolState } from "@/lib/cli-tool-status";
import { cn } from "@/lib/utils";
import type { CLIToolSummary } from "@/types/cli-tool";

interface CLIToolCardProps {
  tool: CLIToolSummary;
  onClick?: () => void;
}

function ToolIcon({ icon, name }: { icon: string; name: string }) {
  const [isBroken, setIsBroken] = useState(false);

  if (!icon || isBroken) {
    return <TerminalIcon className="size-4.5 text-muted-foreground" />;
  }

  return (
    <img
      src={icon}
      alt=""
      className="size-5 object-contain"
      onError={() => setIsBroken(true)}
      title={name}
    />
  );
}

export function CLIToolCard({ tool, onClick }: CLIToolCardProps) {
  const state = resolveCLIToolState(tool);
  const meta = cliToolStateMeta[state];
  const StateIcon = meta.icon;

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-0 overflow-hidden border-border/80 py-0 shadow-sm transition-colors duration-150",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        meta.edge,
        onClick &&
          "cursor-pointer hover:border-primary/40 hover:bg-accent/20 focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        state === "absent" && "bg-muted/20",
      )}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onClick();
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={
        onClick ? `${tool.name} — ${meta.label}, open settings` : undefined
      }
    >
      <div className="flex min-w-0 items-start gap-3 px-4 py-3.5 pl-5">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border",
            state === "connected"
              ? "border-success/30 bg-success/10"
              : "border-border/70 bg-muted/40",
          )}
        >
          <ToolIcon icon={tool.icon} name={tool.name} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={tool.name}>
            {tool.name}
          </p>
          <p
            className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
            title={tool.description}
          >
            {tool.description}
          </p>
        </div>
        <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>

      <CardContent className="mt-auto flex items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5 pl-5">
        <span
          className={cn("size-1.5 shrink-0 rounded-full", meta.dot)}
          aria-hidden
        />
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
            meta.text,
          )}
        >
          <StateIcon className="size-3.5" />
          {meta.label}
        </span>
        <span className="ml-auto min-w-0 truncate text-[11px] text-muted-foreground">
          {meta.hint}
        </span>
      </CardContent>
    </Card>
  );
}

export function CLIToolCardSkeleton() {
  return (
    <Card
      aria-hidden
      className="flex flex-col gap-0 overflow-hidden border-border/80 py-0"
    >
      <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2.5 w-40 max-w-full" />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5 pl-5">
        <Skeleton className="size-1.5 rounded-full" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-2.5 w-28" />
      </div>
    </Card>
  );
}
