import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LinkIcon,
  PencilIcon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  MultiCombobox,
  type MultiComboboxOption,
} from "@/components/ui/multi-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ModelGroupMeta } from "@/hooks/useCLIToolDetail";
import { apiClient } from "@/lib/api-client";
import type {
  ApiKeySummary,
  CLIToolApplyPayload,
  CLIToolDetails,
  CLIToolRoleSlot,
} from "@/types/cli-tool";

interface CLIToolConfigFormProps {
  status: CLIToolDetails | null;
  modelOptions: MultiComboboxOption[];
  modelGroupMeta: Record<string, ModelGroupMeta>;
  apiKeys: ApiKeySummary[];
  defaultEndpoint: string;
  isSaving: boolean;
  onApply: (payload: CLIToolApplyPayload) => Promise<void>;
  onReset: () => Promise<void>;
}

/** Sentinel for the "type my own key" option in the picker. */
const CUSTOM_KEY = "__custom";

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(6)}${key.slice(-4)}`;
}

export function CLIToolConfigForm({
  status,
  modelOptions,
  modelGroupMeta,
  apiKeys,
  defaultEndpoint,
  isSaving,
  onApply,
  onReset,
}: CLIToolConfigFormProps) {
  const [endpoint, setEndpoint] = useState("");
  const [apiKeyChoice, setApiKeyChoice] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [subagentModel, setSubagentModel] = useState("");
  const [roleSlotValues, setRoleSlotValues] = useState<Record<string, string>>(
    {},
  );
  /** Resolved plaintext for the picked stored key, fetched only on demand. */
  const [resolvedKey, setResolvedKey] = useState("");
  const [isKeyLoading, setIsKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const form = status?.form;
  const roleSlots = form?.roleSlots ?? [];
  const hideSubagentModel = form?.hideSubagentModel ?? false;
  const usesRoleSlots = roleSlots.length > 0;
  const savedKey = status?.details?.apiKey ?? "";

  // Sync from the loaded config on mount, after apply, and after reset.
  useEffect(() => {
    const details = status?.details;
    setEndpoint(details?.baseUrl ?? defaultEndpoint);
    setSelectedModels(details?.models ?? []);
    setActiveModel(details?.activeModel ?? "");
    setSubagentModel(details?.subagentModel ?? "");
    setRoleSlotValues(details?.roleSlots ?? {});
  }, [status, defaultEndpoint]);

  /**
   * Identify which stored key the saved config points at.
   *
   * Matching is done on the `last4` the list endpoint now returns. The previous
   * implementation fetched every key's plaintext in a loop and compared strings,
   * which pulled every secret in the account into the browser on page load just
   * to render one label.
   */
  useEffect(() => {
    setKeyError(null);
    if (!savedKey) {
      setApiKeyChoice("");
      setCustomKey("");
      setResolvedKey("");
      return;
    }
    const tail = savedKey.slice(-4);
    const matches = apiKeys.filter((key) => key.last4 && key.last4 === tail);
    if (matches.length === 1 && matches[0]) {
      setApiKeyChoice(matches[0].id);
      setResolvedKey(savedKey);
      setCustomKey("");
      return;
    }
    // Ambiguous or unknown — treat the saved value as a custom entry so the
    // user still sees exactly what is in the config file.
    setApiKeyChoice(CUSTOM_KEY);
    setCustomKey(savedKey);
    setResolvedKey("");
  }, [savedKey, apiKeys]);

  async function handleKeyChoice(choice: string) {
    setApiKeyChoice(choice);
    setKeyError(null);
    if (choice === CUSTOM_KEY) {
      setResolvedKey("");
      return;
    }
    setIsKeyLoading(true);
    try {
      const res = await apiClient.get<{ key: string }>(
        `/api/settings/api-keys/${encodeURIComponent(choice)}/key`,
      );
      setResolvedKey(res.key);
    } catch {
      setResolvedKey("");
      setKeyError(
        "This key could not be read. It may predate encryption — recreate it in Settings.",
      );
    } finally {
      setIsKeyLoading(false);
    }
  }

  const isCustomMode = apiKeyChoice === CUSTOM_KEY || apiKeys.length === 0;
  const effectiveKey = isCustomMode ? customKey.trim() : resolvedKey;
  const selectedKeyMeta = apiKeys.find((key) => key.id === apiKeyChoice);

  const trimmedEndpoint = endpoint.trim();
  const endpointError = (() => {
    if (!trimmedEndpoint) return "An endpoint is required.";
    try {
      const url = new URL(trimmedEndpoint);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return "The endpoint must use HTTP or HTTPS.";
      }
    } catch {
      return "Enter a full URL, including http://.";
    }
    return null;
  })();

  const canSubmit =
    !isSaving && !isKeyLoading && !endpointError && Boolean(effectiveKey);

  function handleModelsChange(next: string[]) {
    setSelectedModels(next);
    if (activeModel && !next.includes(activeModel)) {
      setActiveModel(next[0] ?? "");
    }
  }

  function handleRoleSlotChange(slot: CLIToolRoleSlot, value: string) {
    setRoleSlotValues((prev) => ({ ...prev, [slot.envKey]: value }));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    void onApply({
      baseUrl: trimmedEndpoint,
      apiKey: effectiveKey,
      ...(usesRoleSlots
        ? { roleSlots: roleSlotValues }
        : {
            models: selectedModels,
            activeModel,
            // Send raw value — empty string clears the saved subagent.
            subagentModel,
          }),
    });
  }

  function handleReset() {
    setSubagentModel("");
    void onReset();
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="gap-1 border-b border-border/60 bg-muted/20 px-5 py-4">
        <CardTitle className="text-base">Configuration</CardTitle>
        <CardDescription className="text-xs">
          Written to this tool's own config file. Applying overwrites only the
          kcgrouter provider entry.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 px-5 py-5">
        <Field data-invalid={Boolean(endpointError)} className="gap-2">
          <FieldLabel htmlFor="endpoint" className="text-xs">
            <LinkIcon className="size-3.5 text-muted-foreground" />
            Router endpoint
          </FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id="endpoint"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder={defaultEndpoint}
              className="font-mono text-sm"
              disabled={isSaving}
              aria-invalid={Boolean(endpointError)}
              autoComplete="off"
              spellCheck={false}
            />
            {trimmedEndpoint !== defaultEndpoint ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEndpoint(defaultEndpoint)}
                disabled={isSaving}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <RotateCcwIcon data-icon="inline-start" />
                Default
              </Button>
            ) : null}
          </div>
          <FieldDescription className="text-xs">
            {form?.baseUrlStyle === "root"
              ? "This client appends /v1 itself, so point it at the router root."
              : "OpenAI-style client — this must include /v1."}
          </FieldDescription>
          {endpointError ? <FieldError>{endpointError}</FieldError> : null}
        </Field>

        <Field className="gap-2">
          <FieldLabel htmlFor="apikey" className="text-xs">
            <KeyRoundIcon className="size-3.5 text-muted-foreground" />
            Router API key
          </FieldLabel>

          {apiKeys.length === 0 ? (
            <>
              <Input
                id="apikey"
                type={showCustomKey ? "text" : "password"}
                value={customKey}
                onChange={(event) => setCustomKey(event.target.value)}
                placeholder="sk_kcgrouter…"
                className="font-mono text-sm"
                disabled={isSaving}
                autoComplete="off"
                spellCheck={false}
              />
              <FieldDescription className="text-xs">
                No router keys exist yet. Create one in Settings, or paste a
                value here.
              </FieldDescription>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Select
                  value={apiKeyChoice}
                  disabled={isSaving || isKeyLoading}
                  onValueChange={(id) => void handleKeyChoice(id)}
                >
                  <SelectTrigger id="apikey" className="w-full">
                    <SelectValue placeholder="Choose a key" />
                  </SelectTrigger>
                  <SelectContent>
                    {apiKeys.map((key) => (
                      <SelectItem key={key.id} value={key.id}>
                        <span className="flex items-center gap-2">
                          <KeyRoundIcon className="size-3.5 text-muted-foreground" />
                          {key.label}
                          {key.last4 ? (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              ••{key.last4}
                            </span>
                          ) : null}
                        </span>
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_KEY}>
                      <span className="flex items-center gap-2">
                        <PencilIcon className="size-3.5 text-muted-foreground" />
                        Enter a key manually
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {isKeyLoading ? (
                  <Spinner className="size-4 shrink-0 text-muted-foreground" />
                ) : null}
              </div>

              {isCustomMode ? (
                <div className="relative">
                  <Input
                    id="apikey-custom"
                    type={showCustomKey ? "text" : "password"}
                    value={customKey}
                    onChange={(event) => setCustomKey(event.target.value)}
                    placeholder="sk_kcgrouter…"
                    className="pr-10 font-mono text-sm"
                    disabled={isSaving}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Custom API key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowCustomKey((shown) => !shown)}
                    aria-label={showCustomKey ? "Hide key" : "Show key"}
                  >
                    {showCustomKey ? (
                      <EyeOffIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </Button>
                </div>
              ) : selectedKeyMeta && resolvedKey ? (
                <p className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <CheckIcon className="size-3.5 text-emerald-500" />
                  {maskKey(resolvedKey)}
                </p>
              ) : null}

              {!isCustomMode && !resolvedKey && !isKeyLoading && !keyError ? (
                <FieldDescription className="text-xs">
                  Pick the key this client should authenticate with.
                </FieldDescription>
              ) : null}
            </>
          )}

          {keyError ? (
            <p className="inline-flex items-start gap-1.5 text-xs text-destructive">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              {keyError}
            </p>
          ) : null}
        </Field>

        <div className="border-t border-border/50" />

        {usesRoleSlots ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <p className="text-xs font-medium">Model roles</p>
              <p className="text-xs text-muted-foreground">
                This client asks for a model by role. Leave a role empty to use
                its built-in default.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {roleSlots.map((slot) => (
                <Field key={slot.envKey} className="gap-2">
                  <FieldLabel
                    htmlFor={`role-${slot.envKey}`}
                    className="text-xs"
                  >
                    {slot.label}
                  </FieldLabel>
                  <div className="flex items-center gap-1.5">
                    <Combobox
                      className="min-w-0 flex-1"
                      id={`role-${slot.envKey}`}
                      options={modelOptions}
                      value={roleSlotValues[slot.envKey] ?? ""}
                      onValueChange={(value) =>
                        handleRoleSlotChange(slot, value)
                      }
                      disabled={isSaving}
                      placeholder={
                        slot.defaultValue
                          ? `Default: ${slot.defaultValue}`
                          : "Select model"
                      }
                      searchPlaceholder="Search models..."
                      dialogTitle={`Model for ${slot.label}`}
                      noResultsLabel="No models found"
                      customLabel="Use"
                      groupMeta={modelGroupMeta}
                    />
                    {roleSlotValues[slot.envKey] ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRoleSlotChange(slot, "")}
                        disabled={isSaving}
                        aria-label={`Clear ${slot.label}`}
                        className="shrink-0 text-muted-foreground"
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </Field>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field className="gap-2">
              <FieldLabel className="text-xs">
                <SparklesIcon className="size-3.5 text-muted-foreground" />
                Exposed models
              </FieldLabel>
              <MultiCombobox
                className="w-full"
                options={modelOptions}
                value={selectedModels}
                onValueChange={handleModelsChange}
                activeValue={activeModel}
                onActiveChange={setActiveModel}
                disabled={isSaving}
                emptyLabel="No models selected"
                emptyHint="This client will see no models until you add one."
                searchPlaceholder="Search models..."
                addLabel="Add model"
                dialogTitle="Select models"
                doneLabel="Done"
                noResultsLabel="No models found"
                groupMeta={modelGroupMeta}
              />
              <FieldDescription className="text-xs">
                {modelOptions.length === 0
                  ? "Nothing routable yet — enable models under Providers, or create a combo."
                  : "Star one to make it this client's default."}
              </FieldDescription>
            </Field>

            {!hideSubagentModel ? (
              <Field className="gap-2">
                <FieldLabel htmlFor="subagent-model" className="text-xs">
                  Subagent model
                </FieldLabel>
                <div className="flex items-center gap-1.5">
                  <Combobox
                    className="min-w-0 flex-1"
                    id="subagent-model"
                    options={modelOptions}
                    value={subagentModel}
                    onValueChange={setSubagentModel}
                    disabled={isSaving}
                    placeholder="Same as default"
                    searchPlaceholder="Search models..."
                    dialogTitle="Subagent model"
                    noResultsLabel="No models found"
                    customLabel="Use"
                    groupMeta={modelGroupMeta}
                  />
                  {subagentModel ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setSubagentModel("")}
                      disabled={isSaving}
                      aria-label="Clear subagent model"
                      className="shrink-0 text-muted-foreground"
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
                <FieldDescription className="text-xs">
                  Used for background subagent work. Leave empty to skip.
                </FieldDescription>
              </Field>
            ) : null}
          </div>
        )}
      </CardContent>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-5 py-4">
        <div className="flex items-center gap-2">
          {status?.configured ? (
            <Badge
              variant="outline"
              className="gap-1.5 text-[11px] font-normal text-muted-foreground"
            >
              <span
                className="size-1.5 rounded-full bg-emerald-500"
                aria-hidden
              />
              Config present
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              Not written yet
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={isSaving || !status?.configured}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon data-icon="inline-start" />
            Remove config
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {isSaving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CheckIcon data-icon="inline-start" />
            )}
            Apply
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function CLIToolConfigFormSkeleton() {
  return (
    <Card aria-hidden className="gap-0 overflow-hidden py-0">
      <CardHeader className="gap-1 border-b border-border/60 bg-muted/20 px-5 py-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5 px-5 py-5">
        {["endpoint", "apikey"].map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-2.5 w-56 max-w-full" />
          </div>
        ))}
        <div className="border-t border-border/50" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-16 w-full" />
        </div>
      </CardContent>
      <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-5 py-4">
        <Skeleton className="h-5 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
    </Card>
  );
}
