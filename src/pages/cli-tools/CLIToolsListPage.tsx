import {
  CheckCircle2Icon,
  PlugZapIcon,
  RefreshCwIcon,
  SearchIcon,
  TerminalIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  CLIToolCard,
  CLIToolCardSkeleton,
} from "@/components/cli-tools/CLIToolCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCLITools } from "@/hooks/useCLITools";
import { useRouter } from "@/hooks/useRouter";
import { resolveCLIToolState } from "@/lib/cli-tool-status";
import { cn } from "@/lib/utils";
import type { CLIToolSummary } from "@/types/cli-tool";

const metricTone = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  muted: "border-border bg-muted/50 text-muted-foreground",
} as const;

type MetricTone = keyof typeof metricTone;

function MetricCell({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof TerminalIcon;
  tone?: MetricTone;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-3.5 sm:px-4">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          metricTone[tone],
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-14" />
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono text-base font-semibold tracking-tight tabular-nums">
              {value}
            </span>
            {hint ? (
              <span className="truncate text-[11px] text-muted-foreground">
                {hint}
              </span>
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}

type ToolEntry = [string, CLIToolSummary];

function ToolGroup({
  title,
  description,
  entries,
  onOpen,
}: {
  title: string;
  description: string;
  entries: ToolEntry[];
  onOpen: (id: string) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-center gap-3">
        <h3 className="shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h3>
        <span className="h-px flex-1 bg-border/60" aria-hidden />
        <Badge
          variant="secondary"
          className="shrink-0 font-mono text-[10px] tabular-nums"
        >
          {entries.length}
        </Badge>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entries.map(([id, tool]) => (
          <CLIToolCard key={id} tool={tool} onClick={() => onOpen(id)} />
        ))}
      </div>
    </section>
  );
}

export function CLIToolsListPage() {
  const { tools, isLoading, error, refreshTools } = useCLITools();
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");

  const entries = useMemo<ToolEntry[]>(
    () => (tools ? Object.entries(tools) : []),
    [tools],
  );

  /**
   * Counted per resolved state rather than derived by subtraction: `installed`
   * and `configured` are independent, so `installed - configured` undercounts a
   * tool that holds config without an install.
   */
  const metrics = useMemo(() => {
    let connected = 0;
    let pending = 0;
    let absent = 0;
    for (const [, tool] of entries) {
      const state = resolveCLIToolState(tool);
      if (state === "connected") connected += 1;
      else if (state === "absent") absent += 1;
      else pending += 1;
    }
    return { connected, pending, absent };
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      ([id, tool]) =>
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const grouped = useMemo(() => {
    const connected: ToolEntry[] = [];
    const pending: ToolEntry[] = [];
    const absent: ToolEntry[] = [];
    for (const entry of filtered) {
      const state = resolveCLIToolState(entry[1]);
      if (state === "connected") connected.push(entry);
      else if (state === "absent") absent.push(entry);
      else pending.push(entry);
    }
    return { connected, pending, absent };
  }, [filtered]);

  const isInitialLoading = tools === null && isLoading;

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-72 sm:flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tools"
            aria-label="Search CLI tools"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
            disabled={entries.length === 0}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void refreshTools()}
          disabled={isLoading}
          aria-busy={isLoading}
          className="w-fit"
        >
          <RefreshCwIcon
            data-icon="inline-start"
            className={cn(isLoading && "animate-spin")}
          />
          {isLoading ? "Rescanning" : "Rescan"}
        </Button>
      </header>

      {error ? (
        <Alert variant="destructive">
          <TerminalIcon />
          <AlertTitle>CLI tools could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshTools()}
              disabled={isLoading}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="!py-0 overflow-hidden">
        <div className="grid grid-cols-3 gap-px bg-border/60 [&>*]:bg-card">
          <MetricCell
            label="Connected"
            value={String(metrics.connected)}
            hint="routing here"
            icon={CheckCircle2Icon}
            tone={metrics.connected > 0 ? "ok" : "muted"}
            loading={isInitialLoading}
          />
          <MetricCell
            label="Needs setup"
            value={String(metrics.pending)}
            hint="installed only"
            icon={PlugZapIcon}
            tone={metrics.pending > 0 ? "amber" : "muted"}
            loading={isInitialLoading}
          />
          <MetricCell
            label="Not detected"
            value={String(metrics.absent)}
            hint="not installed"
            icon={TerminalIcon}
            tone="muted"
            loading={isInitialLoading}
          />
        </div>
      </Card>

      {isInitialLoading ? (
        <div
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="Loading CLI tools"
        >
          <CLIToolCardSkeleton />
          <CLIToolCardSkeleton />
          <CLIToolCardSkeleton />
        </div>
      ) : null}

      {tools !== null && entries.length === 0 ? (
        <Empty className="min-h-72 border border-dashed bg-card/60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TerminalIcon />
            </EmptyMedia>
            <EmptyTitle>No CLI tools available</EmptyTitle>
            <EmptyDescription>
              This build ships no client integrations.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {tools !== null && entries.length > 0 && filtered.length === 0 ? (
        <Empty className="min-h-48 border border-dashed bg-card/60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No tools match “{query.trim()}”</EmptyTitle>
            <EmptyDescription>
              Searches cover the tool name and description.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {filtered.length > 0 ? (
        <div className="flex flex-col gap-6">
          {error ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-amber-500">
              Showing last known client state
            </p>
          ) : null}
          <ToolGroup
            title="Connected"
            description="Already pointed at this router."
            entries={grouped.connected}
            onOpen={(id) => navigate(`/cli-tools/${id}`)}
          />
          <ToolGroup
            title="Needs attention"
            description="Detected or already holding config, but not routing through kcgrouter yet."
            entries={grouped.pending}
            onOpen={(id) => navigate(`/cli-tools/${id}`)}
          />
          <ToolGroup
            title="Not detected"
            description="No installation found. You can still write a config for later."
            entries={grouped.absent}
            onOpen={(id) => navigate(`/cli-tools/${id}`)}
          />
        </div>
      ) : null}
    </div>
  );
}
