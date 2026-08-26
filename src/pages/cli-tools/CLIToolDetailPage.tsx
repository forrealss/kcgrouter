import {
  CheckCircle2Icon,
  CircleSlash2Icon,
  KeyRoundIcon,
  Layers3Icon,
  RefreshCwIcon,
  Settings2Icon,
  TerminalIcon,
} from "lucide-react";
import {
  CLIToolConfigForm,
  CLIToolConfigFormSkeleton,
} from "@/components/cli-tools/CLIToolConfigForm";
import { CLIToolDetailHeader } from "@/components/cli-tools/CLIToolDetailHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCLIToolDetail } from "@/hooks/useCLIToolDetail";
import { cn } from "@/lib/utils";

const metricTone = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  violet: "border-chart-2/30 bg-chart-2/10 text-chart-2",
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
          <Skeleton className="mt-1 h-5 w-16" />
        ) : (
          <p className="glow-primary font-mono text-base font-semibold tracking-tight tabular-nums">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

export function CLIToolDetailPage({ toolId }: { toolId: string }) {
  const {
    status,
    toolMeta,
    modelOptions,
    modelGroupMeta,
    apiKeys,
    isLoading,
    error,
    isSaving,
    defaultEndpoint,
    applyConfig,
    resetConfig,
    refreshDetails,
  } = useCLIToolDetail(toolId);

  const isConfigured = Boolean(status?.configured);
  const isInstalled = Boolean(status?.installed);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 scrollbar-subtle">
      <CLIToolDetailHeader
        toolId={toolId}
        toolMeta={toolMeta}
        status={status}
      />

      <Card className="!py-0 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4 [&>*]:bg-card">
          <MetricCell
            label="Install state"
            value={isInstalled ? "READY" : "MISSING"}
            icon={isInstalled ? CheckCircle2Icon : CircleSlash2Icon}
            tone={isInstalled ? "ok" : "amber"}
            loading={isLoading}
          />
          <MetricCell
            label="Router link"
            value={isConfigured ? "ACTIVE" : "OFFLINE"}
            icon={Settings2Icon}
            tone={isConfigured ? "ok" : "amber"}
            loading={isLoading}
          />
          <MetricCell
            label="Model targets"
            value={String(modelOptions.length)}
            icon={Layers3Icon}
            tone="violet"
            loading={isLoading}
          />
          <MetricCell
            label="API keys"
            value={String(apiKeys.length)}
            icon={KeyRoundIcon}
            tone={apiKeys.length > 0 ? "primary" : "amber"}
            loading={isLoading}
          />
        </div>
      </Card>

      {isSaving ? (
        <Badge
          variant="outline"
          className="w-fit gap-1.5 font-mono text-[10px]"
          aria-live="polite"
        >
          <RefreshCwIcon className="size-3 animate-spin" />
          APPLYING
        </Badge>
      ) : null}

      {isLoading ? (
        <div role="status" aria-label="Loading CLI tool configuration">
          <CLIToolConfigFormSkeleton />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <TerminalIcon />
          <AlertTitle>CLI tool state unavailable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>{" "}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshDetails()}
              disabled={isLoading}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <section aria-label="CLI tool configuration" className="min-w-0">
          <CLIToolConfigForm
            status={status}
            modelOptions={modelOptions}
            modelGroupMeta={modelGroupMeta}
            apiKeys={apiKeys}
            defaultEndpoint={defaultEndpoint}
            isSaving={isSaving}
            onApply={applyConfig}
            onReset={resetConfig}
          />
        </section>
      )}
    </div>
  );
}
