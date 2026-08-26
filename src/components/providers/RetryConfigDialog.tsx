import { InfoIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NumberInput } from "@/components/ui/number-input";
import { Spinner } from "@/components/ui/spinner";
import {
  formatRetryRule,
  formatWorstCase,
  RETRY_STATUSES,
} from "@/lib/retry-defaults";
import { cn } from "@/lib/utils";
import type { RetryConfig } from "@/types/provider";

interface RetryConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  config: RetryConfig | null;
  onSave: (config: RetryConfig | null) => Promise<boolean>;
}

type DraftRule = { attempts: string; delaySec: string };

function ruleToDraft(
  rule: { attempts: number; delayMs: number } | undefined,
): DraftRule {
  if (!rule) return { attempts: "", delaySec: "" };
  return {
    attempts: String(rule.attempts),
    delaySec: String(rule.delayMs / 1000),
  };
}

function configToDraft(config: RetryConfig | null): Record<number, DraftRule> {
  return Object.fromEntries(
    RETRY_STATUSES.map(({ status }) => [status, ruleToDraft(config?.[status])]),
  );
}

export function RetryConfigDialog({
  open,
  onOpenChange,
  providerName,
  config,
  onSave,
}: RetryConfigDialogProps) {
  const [draft, setDraft] = useState<Record<number, DraftRule>>(() =>
    configToDraft(config),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(configToDraft(config));
      setError(null);
    }
  }, [open, config]);

  const overriddenCount = useMemo(
    () =>
      RETRY_STATUSES.filter(
        ({ status }) => (draft[status]?.attempts ?? "").trim() !== "",
      ).length,
    [draft],
  );

  function handleOpenChange(nextOpen: boolean) {
    if (isSaving) return;
    onOpenChange(nextOpen);
  }

  function updateRule(status: number, patch: Partial<DraftRule>) {
    setDraft((current) => ({
      ...current,
      [status]: {
        attempts: current[status]?.attempts ?? "",
        delaySec: current[status]?.delaySec ?? "",
        ...patch,
      },
    }));
  }

  /** Drop a single row back to the global default. */
  function clearRule(status: number) {
    setDraft((current) => ({
      ...current,
      [status]: { attempts: "", delaySec: "" },
    }));
    setError(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const next: RetryConfig = {};
    for (const { status } of RETRY_STATUSES) {
      const rule = draft[status] ?? { attempts: "", delaySec: "" };
      const attempts =
        rule.attempts.trim() === "" ? NaN : Number(rule.attempts);
      const delaySec = rule.delaySec.trim() === "" ? 0 : Number(rule.delaySec);
      if (!Number.isFinite(attempts)) continue; // blank row = not overridden
      if (!Number.isInteger(attempts) || attempts < 0 || attempts > 20) {
        setError(
          `Status ${status}: attempts must be a whole number from 0 to 20.`,
        );
        return;
      }
      if (!Number.isFinite(delaySec) || delaySec < 0 || delaySec > 3600) {
        setError(
          `Status ${status}: delay must be a number of seconds from 0 to 3600.`,
        );
        return;
      }
      next[status] = { attempts, delayMs: Math.round(delaySec * 1000) };
    }

    setError(null);
    setIsSaving(true);
    try {
      const ok = await onSave(Object.keys(next).length > 0 ? next : null);
      if (ok) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    setError(null);
    setIsSaving(true);
    try {
      const ok = await onSave(null);
      if (ok) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1 border-b border-border/60 bg-muted/20 px-5 py-4 pr-12">
          <DialogTitle className="text-base">Retry policy</DialogTitle>
          <DialogDescription>
            How{" "}
            <span className="font-medium text-foreground">{providerName}</span>{" "}
            handles upstream failures before falling over to the next
            connection.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-5 py-2.5">
            <p className="text-xs text-muted-foreground">
              Leave a row untouched to keep the default.
            </p>
            <Badge
              variant={overriddenCount > 0 ? "secondary" : "outline"}
              className="font-mono text-[11px] tabular-nums"
            >
              {overriddenCount} custom
            </Badge>
          </div>

          <div className="scrollbar-subtle flex min-h-0 flex-1 flex-col divide-y divide-border/60 overflow-y-auto overscroll-contain">
            {RETRY_STATUSES.map(({ status, reason, note, fallback }) => {
              const rule = draft[status] ?? { attempts: "", delaySec: "" };
              const isCustom = rule.attempts.trim() !== "";
              const attempts = Number(rule.attempts);
              const delaySec =
                rule.delaySec.trim() === "" ? 0 : Number(rule.delaySec);
              const effective =
                isCustom && Number.isFinite(attempts)
                  ? { attempts, delayMs: delaySec * 1000 }
                  : fallback;

              return (
                <div
                  key={status}
                  className={cn(
                    "relative px-5 py-3 transition-colors",
                    "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
                    isCustom
                      ? "bg-primary/[0.04] before:bg-primary/70"
                      : "before:bg-transparent",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {status}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {reason}
                    </span>
                    {isCustom ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        onClick={() => clearRule(status)}
                        disabled={isSaving}
                      >
                        Use default
                      </Button>
                    ) : (
                      <Badge
                        variant="outline"
                        className="ml-auto text-[11px] font-normal text-muted-foreground"
                      >
                        Default
                      </Badge>
                    )}
                  </div>

                  <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>

                  <div className="mt-2.5 grid grid-cols-[1fr_1fr] gap-2">
                    <div>
                      <label
                        htmlFor={`retry-attempts-${status}`}
                        className="text-[11px] uppercase tracking-wide text-muted-foreground"
                      >
                        Retries
                      </label>
                      <NumberInput
                        id={`retry-attempts-${status}`}
                        className="mt-1"
                        value={rule.attempts}
                        onValueChange={(next) =>
                          updateRule(status, { attempts: next })
                        }
                        min={0}
                        max={20}
                        step={1}
                        fallback={fallback.attempts}
                        placeholder={String(fallback.attempts)}
                        disabled={isSaving}
                        aria-label={`Retries for status ${status}`}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`retry-delay-${status}`}
                        className="text-[11px] uppercase tracking-wide text-muted-foreground"
                      >
                        Delay
                      </label>
                      <NumberInput
                        id={`retry-delay-${status}`}
                        className="mt-1"
                        value={rule.delaySec}
                        onValueChange={(next) =>
                          updateRule(status, {
                            delaySec: next,
                            // A row only counts as overridden when `attempts`
                            // is filled in, so touching the delay alone would
                            // be silently dropped on save. Promote the row.
                            ...(isCustom
                              ? {}
                              : { attempts: String(fallback.attempts) }),
                          })
                        }
                        min={0}
                        max={3600}
                        step={0.5}
                        fallback={fallback.delayMs / 1000}
                        placeholder={String(fallback.delayMs / 1000)}
                        unit="s"
                        disabled={isSaving || effective.attempts === 0}
                        aria-label={`Delay in seconds for status ${status}`}
                      />
                    </div>
                  </div>

                  <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatRetryRule(effective.attempts, effective.delayMs)}
                    <span aria-hidden> · </span>
                    {formatWorstCase(effective.attempts, effective.delayMs)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="shrink-0">
            <div className="flex gap-2 border-t border-border/60 bg-muted/20 px-5 py-3">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Delays are jittered ±25% to avoid retry storms. An upstream{" "}
                <code className="rounded border border-border/60 bg-background/70 px-1 font-mono text-[10px]">
                  Retry-After
                </code>{" "}
                header always wins over the configured delay.
              </p>
            </div>

            {error ? (
              <div className="px-5 pt-4">
                <Alert variant="destructive">
                  <AlertTitle>Retry policy could not be saved</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            ) : null}

            <DialogFooter className="border-t border-border/60 px-5 py-4 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleReset()}
                disabled={isSaving}
                className="text-muted-foreground hover:text-foreground"
              >
                {isSaving ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RotateCcwIcon data-icon="inline-start" />
                )}
                Reset all to defaults
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                Save policy
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
