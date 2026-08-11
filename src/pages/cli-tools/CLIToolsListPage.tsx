import {
  ActivityIcon,
  CheckCircle2Icon,
  DownloadIcon,
  RefreshCwIcon,
  Settings2Icon,
  TerminalIcon,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useCLITools } from "@/hooks/useCLITools";
import { useRouter } from "@/hooks/useRouter";
import { cn } from "@/lib/utils";

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
  icon: Icon,
  tone = "primary",
  loading,
}: {
  label: string;
  value: string;
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
          <p className="glow-primary font-mono text-base font-semibold tracking-tight tabular-nums">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

export function CLIToolsListPage() {
  const { tools, isLoading, error, refreshTools } = useCLITools();
  const { navigate } = useRouter();
  const entries = tools ? Object.entries(tools) : [];
  const configuredCount = entries.filter(([, tool]) => tool.configured).length;
  const installedCount = entries.filter(([, tool]) => tool.installed).length;
  const pendingCount = Math.max(installedCount - configuredCount, 0);

  function handleToolClick(toolId: string) {
    navigate(`/cli-tools/${toolId}`);
  }

  const isRefreshing = isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 scrollbar-subtle">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Integrations / clients
          </p>
          <h2 className="text-xl font-semibold tracking-tight">CLI Tools</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect local coding clients to KCG Router and keep every endpoint
            configuration in one control surface.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 font-mono text-[11px]">
            <span
              className={cn(
                "size-1.5 rounded-full",
                isRefreshing
                  ? "animate-pulse bg-amber-400"
                  : "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
              )}
            />
            {isRefreshing ? "SYNCING" : "READY"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshTools()}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            <RefreshCwIcon
              className={cn("size-3.5", isRefreshing && "animate-spin")}
            />
            {isRefreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
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
              disabled={isRefreshing}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="!py-0 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4 [&>*]:bg-card">
          <MetricCell
            label="Available"
            value={String(entries.length)}
            icon={TerminalIcon}
            loading={tools === null}
          />
          <MetricCell
            label="Installed"
            value={String(installedCount)}
            icon={DownloadIcon}
            tone="amber"
            loading={tools === null}
          />
          <MetricCell
            label="Connected"
            value={String(configuredCount)}
            icon={CheckCircle2Icon}
            tone="ok"
            loading={tools === null}
          />
          <MetricCell
            label="Needs setup"
            value={String(pendingCount)}
            icon={Settings2Icon}
            tone={pendingCount > 0 ? "amber" : "muted"}
            loading={tools === null}
          />
        </div>
      </Card>

      {tools === null && isLoading ? (
        <div
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="Loading CLI tools"
        >
          <CLIToolCardSkeleton />
          <CLIToolCardSkeleton />
          <CLIToolCardSkeleton />
        </div>
      ) : null}

      {tools !== null && entries.length === 0 ? (
        <Empty className="border border-dashed bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TerminalIcon />
            </EmptyMedia>
            <EmptyTitle>No CLI tools available</EmptyTitle>
            <EmptyDescription>
              No supported client integrations are registered in this build.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {tools !== null && entries.length > 0 ? (
        <>
          {error ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-amber-500">
              Showing last known client state
            </p>
          ) : null}
          <section
            aria-label="CLI tool integrations"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {entries.map(([id, tool]) => (
              <CLIToolCard
                key={id}
                tool={tool}
                onClick={() => handleToolClick(id)}
              />
            ))}
          </section>
        </>
      ) : null}

      <p className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <ActivityIcon className="size-3 text-primary" />
        Select a client to manage its router endpoint, API key, and model map.
      </p>
    </div>
  );
}
