import {
  ArrowRightIcon,
  CheckIcon,
  DownloadIcon,
  Settings2Icon,
  TerminalIcon,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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

export function CLIToolCard({ tool, onClick }: CLIToolCardProps) {
  return (
    <Card
      className={cn(
        "group gap-3 py-4",
        onClick &&
          "cursor-pointer transition-all hover:border-primary/40 hover:shadow-md",
      )}
      onClick={onClick}
    >
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/60"
            aria-hidden
          >
            <ToolIcon icon={tool.icon} name={tool.name} />
          </span>
          <span className="truncate">{tool.name}</span>
        </CardTitle>
        <CardDescription className="truncate">
          {tool.description}
        </CardDescription>
        <CardAction>
          {tool.configured ? (
            <Badge className="border-green-500/20 bg-green-500/10 font-normal text-green-600 dark:text-green-400">
              <CheckIcon />
              Connected
            </Badge>
          ) : tool.installed ? (
            <Badge className="border-amber-500/20 bg-amber-500/10 font-normal text-amber-600 dark:text-amber-400">
              <Settings2Icon />
              Not configured
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              <DownloadIcon />
              Not installed
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2 px-4 text-xs text-muted-foreground">
        <span className="truncate">
          {tool.configured
            ? "Connected to KCG Router"
            : tool.installed
              ? "Click to connect to KCG Router"
              : "Install the CLI, then configure it here"}
        </span>
        <ArrowRightIcon className="size-3.5 shrink-0 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
      </CardContent>
    </Card>
  );
}

export function CLIToolCardSkeleton() {
  return (
    <Card aria-hidden className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-3.5 w-40" />
        </CardDescription>
        <CardAction>
          <Skeleton className="h-5 w-24 rounded-full" />
        </CardAction>
      </CardHeader>
      <CardContent className="px-4">
        <Skeleton className="h-3 w-48" />
      </CardContent>
    </Card>
  );
}
