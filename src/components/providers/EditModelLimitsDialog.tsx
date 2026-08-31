import { useEffect, useState } from "react";
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
import { formatTokenWindow } from "@/lib/model-format";
import type { ProviderModel } from "@/types/provider";

const CONTEXT_PRESETS = [128_000, 200_000, 262_144, 1_000_000] as const;

interface EditModelLimitsDialogProps {
  /** The model being edited, or null when the dialog is closed. */
  model: ProviderModel | null;
  onOpenChange: (open: boolean) => void;
  routeId: string;
  onSave: (
    model: ProviderModel,
    limits: { contextLength?: number | null; maxOutputTokens?: number | null },
  ) => Promise<boolean> | boolean;
}

/** Blank means "clear this limit", so null is a meaningful saved value here. */
function parseTokens(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function EditModelLimitsDialog({
  model,
  onOpenChange,
  routeId,
  onSave,
}: EditModelLimitsDialogProps) {
  const [contextLength, setContextLength] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Seed the fields from the model each time a different one is opened.
  useEffect(() => {
    if (!model) return;
    setContextLength(model.contextLength ? String(model.contextLength) : "");
    setMaxOutputTokens(
      model.maxOutputTokens ? String(model.maxOutputTokens) : "",
    );
  }, [model]);

  async function handleSubmit() {
    if (!model || isSaving) return;
    setIsSaving(true);
    try {
      const saved = await onSave(model, {
        contextLength: parseTokens(contextLength),
        maxOutputTokens: parseTokens(maxOutputTokens),
      });
      if (saved) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={model !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Token limits</DialogTitle>
          <DialogDescription>
            {model ? (
              <>
                Set the real window for{" "}
                <code className="font-mono">{routeId}</code>. Clients that read
                these values stop compacting early. Leave a field empty to fall
                back to the client default.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <form
          id="edit-model-limits-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1.5">
              <label
                htmlFor="edit-model-context"
                className="text-xs font-medium text-muted-foreground"
              >
                Context window
              </label>
              <NumberInput
                id="edit-model-context"
                placeholder="Client default"
                value={contextLength}
                onValueChange={setContextLength}
                min={1}
                step={1000}
                fallback={200_000}
                unit="tok"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label
                htmlFor="edit-model-max-output"
                className="text-xs font-medium text-muted-foreground"
              >
                Max output
              </label>
              <NumberInput
                id="edit-model-max-output"
                placeholder="Client default"
                value={maxOutputTokens}
                onValueChange={setMaxOutputTokens}
                min={1}
                step={1000}
                fallback={32_768}
                unit="tok"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Context:</span>
            {CONTEXT_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 font-mono text-[11px] tabular-nums"
                onClick={() => setContextLength(String(preset))}
              >
                {formatTokenWindow(preset)}
              </Button>
            ))}
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-model-limits-form"
            disabled={isSaving}
          >
            {isSaving ? <Spinner data-icon="inline-start" /> : null}
            Save limits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
