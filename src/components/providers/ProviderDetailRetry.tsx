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
import { cn } from "@/lib/utils";
import type { Provider, RetryConfig } from "@/types/provider";

/** Status codes the global retry policy handles, with what each one means. */
const STATUS_ROWS = [
  { status: 429, reason: "Rate limited" },
  { status: 502, reason: "Bad gateway" },
  { status: 503, reason: "Unavailable" },
  { status: 504, reason: "Gateway timeout" },
] as const;

const DEFAULT_LABELS: Record<number, string> = {
  429: "Fail over immediately",
  502: "3 retries, 3s apart",
  503: "3 retries, 2s apart",
  504: "2 retries, 3s apart",
};

function formatRule(attempts: number, delayMs: number): string {
  if (attempts === 0) return "Fail over immediately";
  const seconds = delayMs / 1000;
  const delay = seconds % 1 === 0 ? seconds.toFixed(0) : seconds.toFixed(1);
  return `${attempts} ${attempts === 1 ? "retry" : "retries"}, ${delay}s apart`;
}

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
              <Badge variant="secondary" className="text-[11px]">
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

        <CardContent className="px-5 py-2">
          <dl className="divide-y divide-border/60">
            {STATUS_ROWS.map(({ status, reason }) => {
              const rule = provider.retryConfig?.[status];
              return (
                <div
                  key={status}
                  className="flex items-center justify-between gap-3 py-2.5"
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
                      "shrink-0 text-xs",
                      rule
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {rule
                      ? formatRule(rule.attempts, rule.delayMs)
                      : DEFAULT_LABELS[status]}
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
