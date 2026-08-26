import { Settings2Icon } from "lucide-react";
import { useState } from "react";
import { RetryConfigDialog } from "@/components/providers/RetryConfigDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRetryRule, RETRY_STATUSES } from "@/lib/retry-defaults";
import { cn } from "@/lib/utils";
import type { Provider, RetryConfig } from "@/types/provider";

interface ProviderDetailRetryProps {
  provider: Provider;
  onSave: (config: RetryConfig | null) => Promise<boolean>;
}

export function ProviderDetailRetry({
  provider,
  onSave,
}: ProviderDetailRetryProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const overrideCount = provider.retryConfig
    ? Object.keys(provider.retryConfig).length
    : 0;

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="gap-1 border-b border-border/60 bg-muted/20 px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            Retry policy
            {overrideCount > 0 ? (
              <Badge
                variant="secondary"
                className="font-mono text-[11px] tabular-nums"
              >
                {overrideCount} custom
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            How many times to retry before failing over to the next connection.
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsDialogOpen(true)}
            >
              <Settings2Icon data-icon="inline-start" />
              Configure
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="px-0 py-0">
          <dl className="divide-y divide-border/60">
            {RETRY_STATUSES.map(({ status, reason, fallback }) => {
              const rule = provider.retryConfig?.[status];
              const effective = rule ?? fallback;
              return (
                <div
                  key={status}
                  className={cn(
                    "relative flex items-center justify-between gap-3 px-5 py-2.5",
                    "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
                    rule
                      ? "bg-primary/[0.04] before:bg-primary/70"
                      : "before:bg-transparent",
                  )}
                >
                  <dt className="flex min-w-0 items-baseline gap-2">
                    <span className="font-mono text-sm font-medium tabular-nums">
                      {status}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {reason}
                    </span>
                  </dt>
                  <dd
                    className={cn(
                      "shrink-0 font-mono text-[11px] tabular-nums",
                      rule
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {formatRetryRule(effective.attempts, effective.delayMs)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>

      {isDialogOpen ? (
        <RetryConfigDialog
          open
          onOpenChange={setIsDialogOpen}
          providerName={provider.name}
          config={provider.retryConfig}
          onSave={onSave}
        />
      ) : null}
    </>
  );
}
