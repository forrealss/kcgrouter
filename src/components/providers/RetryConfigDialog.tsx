import { RotateCcwIcon, SaveIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { RetryConfig } from "@/types/provider";

interface RetryConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  config: RetryConfig | null;
  onSave: (config: RetryConfig | null) => Promise<boolean>;
}

/** Status codes shown in the editor (the ones the global config retries). */
const STATUS_ROWS = [429, 502, 503, 504] as const;

type DraftRule = { attempts: string; delaySec: string };

function ruleToDraft(
  rule: { attempts: number; delayMs: number } | undefined,
): DraftRule {
  if (!rule) return { attempts: "", delaySec: "" };
  return {
    attempts: String(rule.attempts),
    delaySec: String(Math.round(rule.delayMs / 1000)),
  };
}

function configToDraft(config: RetryConfig | null): Record<number, DraftRule> {
  return Object.fromEntries(
    STATUS_ROWS.map((status) => [status, ruleToDraft(config?.[status])]),
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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const next: RetryConfig = {};
    for (const status of STATUS_ROWS) {
      const rule = draft[status] ?? { attempts: "", delaySec: "" };
      const attempts =
        rule.attempts.trim() === "" ? NaN : Number(rule.attempts);
      const delaySec =
        rule.delaySec.trim() === "" ? NaN : Number(rule.delaySec);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Retry policy — {providerName}</DialogTitle>
          <DialogDescription>
            Blank rows use the global default.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave}>
          <FieldGroup className="gap-3">
            <div className="flex flex-col gap-2">
              {STATUS_ROWS.map((status) => (
                <div
                  key={status}
                  className="grid grid-cols-[auto_1fr_1fr] items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5"
                >
                  <span className="w-12 font-mono text-sm font-semibold tabular-nums">
                    {status}
                  </span>
                  <Field className="gap-1">
                    <FieldLabel htmlFor={`retry-attempts-${status}`}>
                      Attempts
                    </FieldLabel>
                    <Input
                      id={`retry-attempts-${status}`}
                      type="number"
                      min={0}
                      max={20}
                      step={1}
                      value={draft[status]?.attempts ?? ""}
                      onChange={(event) =>
                        updateRule(status, { attempts: event.target.value })
                      }
                      placeholder="default"
                      disabled={isSaving}
                      className="h-8 font-mono text-xs"
                    />
                  </Field>
                  <Field className="gap-1">
                    <FieldLabel htmlFor={`retry-delay-${status}`}>
                      Delay (s)
                    </FieldLabel>
                    <Input
                      id={`retry-delay-${status}`}
                      type="number"
                      min={0}
                      max={3600}
                      step={0.5}
                      value={draft[status]?.delaySec ?? ""}
                      onChange={(event) =>
                        updateRule(status, { delaySec: event.target.value })
                      }
                      placeholder="default"
                      disabled={isSaving}
                      className="h-8 font-mono text-xs"
                    />
                  </Field>
                </div>
              ))}
            </div>

            <Field>
              <FieldDescription className="text-[11px]">
                429 → none · 502 → 3× @ 3s · 503 → 3× @ 2s · 504 → 2× @ 3s.
                Jittered ±25%; upstream{" "}
                <code className="text-[10px]">Retry-After</code> wins.
              </FieldDescription>
            </Field>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Retry policy could not be saved</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleReset()}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RotateCcwIcon data-icon="inline-start" />
                )}
                Reset to defaults
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
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
