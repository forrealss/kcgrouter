import {
  CheckIcon,
  Layers3Icon,
  SearchIcon,
  ServerIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MultiComboboxOption } from "@/components/ui/multi-combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useApiKeyScopeTargets } from "@/hooks/useApiKeyScopeTargets";
import { cn } from "@/lib/utils";
import {
  type ApiKeyRestrictionsPayload,
  type ApiKeyScopeDraft,
  draftToPayload,
  validateDraft,
} from "@/types/api-key";

/** Above this many options the list gets a filter box. */
const SEARCH_THRESHOLD = 8;

/**
 * Inline multi-select.
 *
 * Deliberately not MultiCombobox: that one opens its own dialog to pick items,
 * which nests a modal inside this one, and its empty state is a tall bordered
 * placeholder. Inline checkboxes keep everything on one surface and the list
 * only scrolls once it is actually long.
 */
function OptionList({
  options,
  selected,
  onChange,
  disabled,
  emptyMessage,
  isLoading,
  searchPlaceholder,
}: {
  options: MultiComboboxOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyMessage: string;
  isLoading: boolean;
  searchPlaceholder: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        opt.value.toLowerCase().includes(term) ||
        (opt.description ?? "").toLowerCase().includes(term) ||
        (opt.group ?? "").toLowerCase().includes(term),
    );
  }, [options, search]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        {["a", "b", "c"].map((k) => (
          <Skeleton key={k} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((o) => selected.includes(o.value));

  return (
    <div className="flex flex-col gap-2">
      {options.length > SEARCH_THRESHOLD ? (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            disabled={disabled}
            className="h-8 pl-8 text-xs"
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {selected.length} of {options.length} selected
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={disabled || filtered.length === 0}
          onClick={() =>
            onChange(
              allVisibleSelected
                ? selected.filter((v) => !filtered.some((o) => o.value === v))
                : [...new Set([...selected, ...filtered.map((o) => o.value)])],
            )
          }
          className="text-muted-foreground hover:text-foreground"
        >
          {allVisibleSelected ? "Clear" : "Select all"}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Nothing matches “{search.trim()}”.
        </p>
      ) : (
        // Caps at roughly six rows; shorter lists take their natural height so
        // there is never an oversized empty area.
        <div className="scrollbar-subtle max-h-52 overflow-y-auto overscroll-contain rounded-md border bg-background">
          {filtered.map((option, index) => {
            const isSelected = selected.includes(option.value);
            const showGroup =
              option.group && option.group !== filtered[index - 1]?.group;
            return (
              <div key={option.value}>
                {showGroup ? (
                  <div className="sticky top-0 z-10 border-b bg-muted/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                    {option.group}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggle(option.value)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors",
                    "hover:bg-accent/60 disabled:pointer-events-none disabled:opacity-50",
                    isSelected && "bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40",
                    )}
                    aria-hidden
                  >
                    {isSelected ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A single on/off scope section, with its picker revealed when enabled. */
function ScopeSection({
  icon: Icon,
  title,
  offHint,
  onHint,
  enabled,
  onEnabledChange,
  disabled,
  children,
  id,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  offHint: string;
  onHint: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-start gap-3 p-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Label htmlFor={id} className="text-sm font-medium">
            {title}
          </Label>
          <p className="text-xs text-muted-foreground">
            {enabled ? onHint : offHint}
          </p>
        </div>
        <Switch
          id={id}
          checked={enabled}
          onCheckedChange={onEnabledChange}
          disabled={disabled}
        />
      </div>
      {enabled ? (
        <div className="border-t bg-muted/20 p-3">{children}</div>
      ) : null}
    </div>
  );
}

export function ApiKeyScopeDialog({
  open,
  onOpenChange,
  keyLabel,
  draft,
  onDraftChange,
  onSave,
  isSaving,
  saveError,
  /** Shown for an existing key; omitted in the create flow. */
  usage,
  onResetUsage,
  isResettingUsage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyLabel: string;
  draft: ApiKeyScopeDraft;
  onDraftChange: (draft: ApiKeyScopeDraft) => void;
  onSave: (payload: ApiKeyRestrictionsPayload) => void;
  isSaving: boolean;
  saveError: string | null;
  usage?: { tokensUsed: number; requestCount: number };
  onResetUsage?: () => void;
  isResettingUsage?: boolean;
}) {
  const targets = useApiKeyScopeTargets(open);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Clear stale validation text when the dialog is reopened.
  useEffect(() => {
    if (open) setValidationError(null);
  }, [open]);

  function patch(changes: Partial<ApiKeyScopeDraft>) {
    setValidationError(null);
    onDraftChange({ ...draft, ...changes });
  }

  function handleSave() {
    const problem = validateDraft(draft);
    if (problem) {
      setValidationError(problem);
      return;
    }
    onSave(draftToPayload(draft));
  }

  const error = validationError ?? saveError ?? targets.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        {/* pr-12 keeps the title clear of the absolutely-positioned close button,
            which the p-0 content padding no longer accounts for. */}
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle>Access for {keyLabel}</DialogTitle>
          <DialogDescription>
            Leave a limit off to allow everything in that category. Limits apply
            to what the request actually runs, so a combo cannot reach a
            provider or model this key is not granted.
          </DialogDescription>
        </DialogHeader>

        {/* Only this middle region scrolls, so the header and the actions stay
            put no matter how many providers or models exist. */}
        <div className="scrollbar-subtle flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <ScopeSection
            id="scope-providers"
            icon={ServerIcon}
            title="Limit providers"
            offHint="Any provider"
            onHint="Only the selected providers"
            enabled={draft.restrictProviders}
            onEnabledChange={(restrictProviders) =>
              patch({ restrictProviders })
            }
            disabled={isSaving}
          >
            <OptionList
              options={targets.providerOptions}
              selected={draft.providerIds}
              onChange={(providerIds) => patch({ providerIds })}
              disabled={isSaving}
              isLoading={targets.isLoading}
              emptyMessage="No providers configured yet."
              searchPlaceholder="Search providers..."
            />
          </ScopeSection>

          <ScopeSection
            id="scope-models"
            icon={SparklesIcon}
            title="Limit models"
            offHint="Any model"
            onHint="Only the selected models"
            enabled={draft.restrictModels}
            onEnabledChange={(restrictModels) => patch({ restrictModels })}
            disabled={isSaving}
          >
            <OptionList
              options={targets.modelOptions}
              selected={draft.models}
              onChange={(models) => patch({ models })}
              disabled={isSaving}
              isLoading={targets.isLoading}
              emptyMessage="No enabled models found. Enable models on a provider first."
              searchPlaceholder="Search models..."
            />
          </ScopeSection>

          <ScopeSection
            id="scope-combos"
            icon={Layers3Icon}
            title="Limit combos"
            offHint="Any combo"
            onHint="Only the selected combos"
            enabled={draft.restrictCombos}
            onEnabledChange={(restrictCombos) => patch({ restrictCombos })}
            disabled={isSaving}
          >
            <OptionList
              options={targets.comboOptions}
              selected={draft.comboIds}
              onChange={(comboIds) => patch({ comboIds })}
              disabled={isSaving}
              isLoading={targets.isLoading}
              emptyMessage="No combos created yet."
              searchPlaceholder="Search combos..."
            />
          </ScopeSection>

          <div className="rounded-lg border p-3">
            <Label htmlFor="scope-token-limit" className="text-sm font-medium">
              Token limit
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Total input + output tokens this key may spend. Leave empty for
              unlimited. Counted after each response, so the request that
              crosses the limit completes and the next one is refused.
            </p>
            <Input
              id="scope-token-limit"
              value={draft.tokenLimit}
              onChange={(event) =>
                patch({ tokenLimit: event.target.value.replace(/[^\d]/g, "") })
              }
              inputMode="numeric"
              placeholder="Unlimited"
              disabled={isSaving}
              className="mt-2 font-mono"
            />

            {usage ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {usage.tokensUsed.toLocaleString("en-US")} tokens used ·{" "}
                  {usage.requestCount.toLocaleString("en-US")} request
                  {usage.requestCount === 1 ? "" : "s"}
                </p>
                {onResetUsage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={onResetUsage}
                    disabled={isResettingUsage || isSaving}
                  >
                    {isResettingUsage ? (
                      <Spinner data-icon="inline-start" />
                    ) : null}
                    Reset usage
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t bg-muted/20 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || targets.isLoading}
          >
            {isSaving ? <Spinner data-icon="inline-start" /> : null}
            Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
