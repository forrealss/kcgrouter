import {
  ArrowLeftIcon,
  KeyRoundIcon,
  LayersIcon,
  RotateCcwIcon,
  Settings2Icon,
} from "lucide-react";
import { useState } from "react";
import { RetryConfigDialog } from "@/components/providers/RetryConfigDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useRouter } from "@/hooks/useRouter";
import { type AccountErrorSummary, formatDate } from "@/lib/provider-errors";
import { transportMeta } from "@/lib/provider-meta";
import {
  providerHealthMeta,
  resolveProviderHealth,
} from "@/lib/provider-status";
import { cn } from "@/lib/utils";
import type {
  Provider,
  ProviderAccount,
  ProviderModel,
  RetryConfig,
} from "@/types/provider";

interface ProviderDetailHeaderProps {
  provider: Provider;
  accounts: ProviderAccount[];
  models: ProviderModel[];
  lastError?: AccountErrorSummary | null;
  onSaveRetryConfig: (config: RetryConfig | null) => Promise<boolean>;
}

type StatTone = "default" | "ok" | "warn";

function StatCell({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  action,
}: {
  icon: typeof KeyRoundIcon;
  label: string;
  value: string;
  hint: string;
  tone?: StatTone;
  /**
   * Slot for a cell that is also a settings entry point (Retry policy's
   * Configure button) rather than a pure readout. Optional so the other two
   * cells, which have nowhere to send a click, stay exactly as before.
   */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 bg-card px-5 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "font-mono text-sm font-semibold tabular-nums tracking-tight",
              tone === "ok" && "text-success",
              tone === "warn" && "text-warning",
            )}
          >
            {value}
          </span>
          <span className="truncate text-xs text-muted-foreground">{hint}</span>
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ProviderDetailHeader({
  provider,
  accounts,
  models,
  lastError,
  onSaveRetryConfig,
}: ProviderDetailHeaderProps) {
  const { navigate } = useRouter();
  const meta = transportMeta[provider.transport];
  const isDark = useDarkMode();
  const health = providerHealthMeta[resolveProviderHealth(accounts)];
  const HealthIcon = health.icon;
  const [isRetryDialogOpen, setIsRetryDialogOpen] = useState(false);

  const activeAccounts = accounts.filter((a) => a.status === "active").length;
  const enabledModels = models.filter((m) => m.enabled).length;
  const retryOverrides = provider.retryConfig
    ? Object.keys(provider.retryConfig).length
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit text-muted-foreground hover:text-foreground"
        onClick={() => navigate("/providers")}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        All providers
      </Button>

      <Card className="gap-0 overflow-hidden border-border/70 py-0">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-xl border",
              meta.accentClassName,
              "dark:shadow-[0_0_24px_-12px] dark:shadow-current",
            )}
            aria-hidden
          >
            {meta.icon ? (
              <img
                src={isDark && meta.darkIcon ? meta.darkIcon : meta.icon}
                alt=""
                className="size-6"
              />
            ) : (
              <meta.fallbackIcon className="size-6" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {provider.name}
              </h1>
              <Badge
                variant="outline"
                className={cn("text-[11px]", meta.accentClassName)}
              >
                {meta.label}
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                {provider.isBuiltin ? "Built-in" : "Custom"}
              </Badge>
            </div>
            <p
              className="mt-1 truncate font-mono text-xs text-muted-foreground"
              title={provider.baseUrl}
            >
              {provider.baseUrl}
            </p>
          </div>

          <div
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2",
              "border-border/70 bg-muted/30",
            )}
          >
            <span className={cn("size-2 rounded-full", health.dot)} />
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-medium",
                health.text,
              )}
            >
              <HealthIcon className="size-3.5" />
              {health.label}
            </span>
          </div>
        </CardContent>

        <div className="grid gap-px border-t border-border/60 bg-border/60 sm:grid-cols-3">
          <StatCell
            icon={KeyRoundIcon}
            label="Connections"
            value={`${activeAccounts}/${accounts.length}`}
            hint="active"
            tone={
              accounts.length === 0
                ? "default"
                : activeAccounts === accounts.length
                  ? "ok"
                  : "warn"
            }
          />
          <StatCell
            icon={LayersIcon}
            label="Models"
            value={`${enabledModels}/${models.length}`}
            hint="routable"
            tone={enabledModels > 0 ? "ok" : "default"}
          />
          <StatCell
            icon={RotateCcwIcon}
            label="Retry policy"
            value={retryOverrides > 0 ? String(retryOverrides) : "0"}
            hint={retryOverrides > 0 ? "custom rules" : "using defaults"}
            action={
              // Icon-only until the cell has room for a label: at the sm
              // breakpoint this is one of three ~200px cells, too narrow for
              // "0 using defaults" plus a labelled button on one line.
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsRetryDialogOpen(true)}
                aria-label="Configure retry policy"
              >
                <Settings2Icon />
                <span className="hidden lg:inline">Configure</span>
              </Button>
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 bg-muted/20 px-5 py-2.5">
          <span className="text-xs text-muted-foreground">Call models as</span>
          <code className="rounded border border-border/60 bg-background/70 px-1.5 py-0.5 font-mono text-xs text-foreground">
            {provider.prefix}/model-id
          </code>
          <CopyButton
            value={`${provider.prefix}/`}
            label="model prefix"
            className="-my-1"
          />
        </div>

        {lastError ? (
          <div className="border-t border-destructive/25 bg-destructive/10 px-5 py-2.5">
            <p className="text-xs font-medium text-destructive">
              Last failure
              {lastError.at ? ` · ${formatDate(lastError.at)}` : ""}
            </p>
            <p
              className="mt-0.5 line-clamp-2 text-xs text-destructive/90"
              title={lastError.message}
            >
              {lastError.message}
            </p>
          </div>
        ) : null}
      </Card>

      {isRetryDialogOpen ? (
        <RetryConfigDialog
          open
          onOpenChange={setIsRetryDialogOpen}
          providerName={provider.name}
          config={provider.retryConfig}
          onSave={onSaveRetryConfig}
        />
      ) : null}
    </div>
  );
}
