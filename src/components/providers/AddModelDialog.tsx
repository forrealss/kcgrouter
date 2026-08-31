import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Spinner } from "@/components/ui/spinner";
import { formatTokenWindow } from "@/lib/model-format";
import type { Provider } from "@/types/provider";

/**
 * Common context windows, offered as one-click presets so the operator does not
 * have to count zeros. 128K is Pi's own fallback, so it doubles as the "leave
 * it at the client default" choice.
 */
const CONTEXT_PRESETS = [128_000, 200_000, 262_144, 1_000_000] as const;

interface AddModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider;
  onAddModel: (input: {
    modelId: string;
    modelName: string;
    contextLength?: number | null;
    maxOutputTokens?: number | null;
  }) => Promise<boolean> | boolean;
}

/** Parses a token field, treating blank as "not set" rather than zero. */
function parseTokens(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function AddModelDialog({
  open,
  onOpenChange,
  provider,
  onAddModel,
}: AddModelDialogProps) {
  const [modelId, setModelId] = useState("");
  const [modelName, setModelName] = useState("");
  const [contextLength, setContextLength] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reopening starts from a clean form: a half-filled model from a cancelled
  // attempt should not silently become part of the next one.
  useEffect(() => {
    if (!open) return;
    setModelId("");
    setModelName("");
    setContextLength("");
    setMaxOutputTokens("");
  }, [open]);

  const trimmedId = modelId.trim();
  const trimmedName = modelName.trim();
  const canSubmit = trimmedId.length > 0 && !isSaving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSaving(true);
    try {
      const created = await onAddModel({
        modelId: trimmedId,
        // Display name is optional here — falling back to the id keeps the
        // required-field count down for the common "just route this" case.
        modelName: trimmedName || trimmedId,
        contextLength: parseTokens(contextLength),
        maxOutputTokens: parseTokens(maxOutputTokens),
      });
      if (created) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a model</DialogTitle>
        </DialogHeader>

        <form
          id="add-model-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1.5">
              <label
                htmlFor="add-model-id"
                className="text-xs font-medium text-muted-foreground"
              >
                Model ID
              </label>
              <Input
                id="add-model-id"
                placeholder="claude-sonnet-5"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label
                htmlFor="add-model-name"
                className="text-xs font-medium text-muted-foreground"
              >
                Display name{" "}
                <span className="font-normal opacity-70">(optional)</span>
              </label>
              <Input
                id="add-model-name"
                placeholder={trimmedId || "Claude Sonnet 5"}
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              />
            </div>
          </div>

          {/*
            Token limits are optional and rarely needed at creation time, so
            they stay folded away — the dialog reads as two fields until the
            user asks for more.
          */}
          <Accordion type="single" collapsible className="-my-1">
            <AccordionItem value="limits" className="border-b-0">
              <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
                Token limits
                <span className="ml-auto mr-1 font-normal opacity-70">
                  {contextLength.trim() || maxOutputTokens.trim()
                    ? "customized"
                    : "client default"}
                </span>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-3 pb-1">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <label
                      htmlFor="add-model-context"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Context window
                    </label>
                    <NumberInput
                      id="add-model-context"
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
                      htmlFor="add-model-max-output"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Max output
                    </label>
                    <NumberInput
                      id="add-model-max-output"
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
                  <span className="text-xs text-muted-foreground">
                    Context:
                  </span>
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Requests will route as{" "}
            <code className="font-mono text-foreground">
              {provider.prefix}/{trimmedId || "model-id"}
            </code>
          </p>
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
          <Button type="submit" form="add-model-form" disabled={!canSubmit}>
            {isSaving ? <Spinner data-icon="inline-start" /> : null}
            Add model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
