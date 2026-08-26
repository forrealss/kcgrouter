import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { useRouter } from "@/hooks/useRouter";
import { type AccountErrorSummary, formatDate } from "@/lib/provider-errors";
import { transportMeta } from "@/lib/provider-meta";
import {
  providerHealthMeta,
  resolveProviderHealth,
} from "@/lib/provider-status";
import { cn } from "@/lib/utils";
import type { Provider, ProviderAccount } from "@/types/provider";

interface ProviderDetailHeaderProps {
  provider: Provider;
  accounts: ProviderAccount[];
  lastError?: AccountErrorSummary | null;
}

export function ProviderDetailHeader({
  provider,
  accounts,
  lastError,
}: ProviderDetailHeaderProps) {
  const { navigate } = useRouter();
  const meta = transportMeta[provider.transport];
  const health = providerHealthMeta[resolveProviderHealth(accounts)];
  const HealthIcon = health.icon;

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
              <img src={meta.icon} alt="" className="size-6" />
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
    </div>
  );
}
