import { ArrowRightIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CLIToolSummary } from "@/types/cli-tool";

interface CLIToolCardProps {
  tool: CLIToolSummary;
  onClick?: () => void;
}

function ToolIcon({ icon, name }: { icon: string; name: string }) {
  const [isBroken, setIsBroken] = useState(false);

  if (!icon || isBroken) {
    return <TerminalIcon className="size-5 text-muted-foreground" />;
  }

  return (
    <img
      src={icon}
      alt={name}
      className="size-6 object-contain"
      onError={() => setIsBroken(true)}
    />
  );
}

function ToolStatus({ tool }: { tool: CLIToolSummary }) {
  if (tool.configured) {
    return (
      <Badge variant="outline" className="gap-1.5 font-mono text-[10px]">
        <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70" />
        CONNECTED
      </Badge>
    );
  }

  if (tool.installed) {
    return (
      <Badge variant="outline" className="gap-1.5 font-mono text-[10px]">
        <span className="size-1.5 rounded-full bg-amber-400" />
        SETUP REQUIRED
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="gap-1.5 font-mono text-[10px] text-muted-foreground"
    >
      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
      NOT DETECTED
    </Badge>
  );
}

export function CLIToolCard({ tool, onClick }: CLIToolCardProps) {
  return (
    <Card
      className={cn(
        "group gap-4 overflow-hidden border-l-2 border-l-primary/50 transition-colors duration-200",
        onClick && "cursor-pointer hover:bg-accent/20",
      )}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onClick();
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <CardHeader className="px-5 pb-0">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/30 bg-primary/10">
            <ToolIcon icon={tool.icon} name={tool.name} />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm font-medium">
              {tool.name}
            </CardTitle>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {tool.description}
            </p>
          </div>
        </div>
        <CardAction>
          <ToolStatus tool={tool} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-5">
        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {tool.configured
              ? "Router endpoint active"
              : tool.installed
                ? "Ready for configuration"
                : "Install client to continue"}
          </span>
          <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export function CLIToolCardSkeleton() {
  return (
    <Card aria-hidden className="gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3.5 w-40 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="mt-2 h-3 w-48" />
    </Card>
  );
}
