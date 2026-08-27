import { AlertCircleIcon, CheckIcon, PlusIcon, ServerIcon } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
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
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDarkMode } from "@/hooks/useDarkMode";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { transportMeta } from "@/lib/provider-meta";
import { cn } from "@/lib/utils";
import type {
  Provider,
  ProviderFormValues,
  ProviderTransport,
} from "@/types/provider";

interface ProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
  /**
   * Existing providers, used to catch duplicate names and prefixes before the
   * request goes out. The server enforces uniqueness too — this just surfaces
   * the collision on the offending field instead of as a generic error.
   */
  existingProviders?: Provider[];
}

const initialValues: ProviderFormValues = {
  name: "",
  transport: "openai",
  baseUrl: "",
  prefix: "",
};

/** Only these two transports can be created by hand; the rest are built-in. */
const customTransports: ProviderTransport[] = ["openai", "anthropic"];

/**
 * Short name for the picker tiles. `transportMeta` labels are descriptive
 * ("OpenAI-compatible") and read as the subtitle underneath.
 */
const transportShortLabel: Partial<Record<ProviderTransport, string>> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/** Suggested base URL per transport, filled in when the field is untouched. */
const transportDefaults: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

const PREFIX_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

type FieldKey = "name" | "prefix" | "baseUrl";

export function ProviderFormDialog({
  open,
  onOpenChange,
  onSaved,
  existingProviders = [],
}: ProviderFormDialogProps) {
  const [values, setValues] = useState<ProviderFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const isDark = useDarkMode();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Whether the user edited the base URL, so we stop auto-filling it. */
  const [baseUrlTouched, setBaseUrlTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setValues({
        ...initialValues,
        baseUrl: transportDefaults[initialValues.transport] ?? "",
      });
      setError(null);
      setFieldErrors({});
      setBaseUrlTouched(false);
    }
  }, [open]);

  const normalizedPrefix = values.prefix.trim().toLowerCase();

  /** Live preview of how a request will address this provider. */
  const routePreview = `${normalizedPrefix || "prefix"}/model-id`;

  const takenPrefixes = useMemo(
    () => new Set(existingProviders.map((p) => p.prefix.toLowerCase())),
    [existingProviders],
  );
  const takenNames = useMemo(
    () => new Set(existingProviders.map((p) => p.name.trim().toLowerCase())),
    [existingProviders],
  );

  function update(patch: Partial<ProviderFormValues>, field?: FieldKey) {
    setValues((current) => ({ ...current, ...patch }));
    if (field) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
    setError(null);
  }

  function handleTransportChange(transport: ProviderTransport) {
    setValues((current) => ({
      ...current,
      transport,
      // Only overwrite the URL while the user has not typed their own, so
      // switching transports never discards something they entered.
      baseUrl: baseUrlTouched
        ? current.baseUrl
        : (transportDefaults[transport] ?? ""),
    }));
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return;
    onOpenChange(nextOpen);
  }

  /** Returns per-field messages; empty object means the form is valid. */
  function validate(): Partial<Record<FieldKey, string>> {
    const next: Partial<Record<FieldKey, string>> = {};
    const name = values.name.trim();
    const baseUrl = values.baseUrl.trim();
    const prefix = normalizedPrefix;

    if (!name) {
      next.name = "Give this provider a name.";
    } else if (takenNames.has(name.toLowerCase())) {
      next.name = "Another provider already uses this name.";
    }

    if (!prefix) {
      next.prefix = "A prefix is required to route requests.";
    } else if (!PREFIX_PATTERN.test(prefix)) {
      next.prefix =
        "Start with a letter or number, then lowercase letters, numbers, hyphens, or dots.";
    } else if (takenPrefixes.has(prefix)) {
      next.prefix = "Another provider already uses this prefix.";
    }

    if (!baseUrl) {
      next.baseUrl = "A base URL is required.";
    } else {
      try {
        const url = new URL(baseUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          next.baseUrl = "Base URL must use HTTP or HTTPS.";
        }
      } catch {
        next.baseUrl = "Enter a full URL, including https://.";
      }
    }

    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError(null);
      return;
    }

    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await apiClient.post<Provider>("/api/providers", {
        name: values.name.trim(),
        transport: values.transport,
        baseUrl: values.baseUrl.trim(),
        prefix: normalizedPrefix,
      });
      await onSaved();
      onOpenChange(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-0 border-b border-border/60 bg-muted/20 px-5 py-4 pr-12">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
              <ServerIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base">Add provider</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed">
                Register an upstream endpoint the router can forward requests
                to.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <FieldGroup className="scrollbar-subtle min-h-0 flex-1 gap-5 overflow-y-auto overscroll-contain px-5 py-5">
            <Field data-invalid={Boolean(fieldErrors.name)} className="gap-2">
              <FieldLabel htmlFor="provider-name" className="text-xs">
                Provider name
              </FieldLabel>
              <Input
                id="provider-name"
                value={values.name}
                onChange={(event) =>
                  update({ name: event.target.value }, "name")
                }
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={
                  fieldErrors.name ? "provider-name-error" : undefined
                }
                autoFocus
                placeholder="Primary OpenAI"
              />
              {fieldErrors.name ? (
                <FieldError id="provider-name-error">
                  {fieldErrors.name}
                </FieldError>
              ) : null}
            </Field>

            <FieldSet className="gap-2">
              <FieldLegend variant="label" className="mb-0 text-xs">
                Transport
              </FieldLegend>
              <div className="grid grid-cols-2 gap-2">
                {customTransports.map((transport) => {
                  const meta = transportMeta[transport];
                  const isSelected = values.transport === transport;
                  return (
                    <label
                      key={transport}
                      className={cn(
                        "flex flex-col gap-2 rounded-lg border p-3 transition-colors",
                        "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                        isSelected
                          ? "border-primary/60 bg-primary/5"
                          : "border-border bg-card hover:bg-accent/40",
                        isSubmitting
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer",
                      )}
                    >
                      <input
                        type="radio"
                        name="provider-transport"
                        value={transport}
                        checked={isSelected}
                        onChange={() => handleTransportChange(transport)}
                        disabled={isSubmitting}
                        className="sr-only"
                      />
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-md border",
                            meta.accentClassName,
                            isSelected &&
                              "dark:shadow-[0_0_14px_-6px] dark:shadow-current",
                          )}
                          aria-hidden
                        >
                          {meta.icon ? (
                            <img
                              src={
                                isDark && meta.darkIcon
                                  ? meta.darkIcon
                                  : meta.icon
                              }
                              alt=""
                              className="size-4"
                            />
                          ) : (
                            <meta.fallbackIcon className="size-4" />
                          )}
                        </span>
                        {isSelected ? (
                          <CheckIcon
                            className="ml-auto size-4 shrink-0 text-primary"
                            aria-hidden
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block truncate text-sm font-medium",
                            !isSelected && "text-muted-foreground",
                          )}
                        >
                          {transportShortLabel[transport]}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                          {meta.label}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <FieldDescription className="text-xs">
                Which API dialect this endpoint speaks. Other transports ship as
                built-in providers.
              </FieldDescription>
            </FieldSet>

            <Field data-invalid={Boolean(fieldErrors.prefix)} className="gap-2">
              <FieldLabel htmlFor="provider-prefix" className="text-xs">
                Prefix
              </FieldLabel>
              <Input
                id="provider-prefix"
                value={values.prefix}
                onChange={(event) =>
                  update({ prefix: event.target.value }, "prefix")
                }
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.prefix)}
                aria-describedby={cn(
                  "provider-prefix-preview",
                  fieldErrors.prefix && "provider-prefix-error",
                )}
                placeholder="my-openai"
                className="font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <FieldDescription
                id="provider-prefix-preview"
                className="text-xs"
              >
                Requests will address this provider as{" "}
                <code className="rounded border border-border/60 bg-muted/60 px-1 py-0.5 font-mono text-[11px] text-foreground">
                  {routePreview}
                </code>
              </FieldDescription>
              {fieldErrors.prefix ? (
                <FieldError id="provider-prefix-error">
                  {fieldErrors.prefix}
                </FieldError>
              ) : null}
            </Field>

            <Field
              data-invalid={Boolean(fieldErrors.baseUrl)}
              className="gap-2"
            >
              <FieldLabel htmlFor="provider-base-url" className="text-xs">
                Base URL
              </FieldLabel>
              <Input
                id="provider-base-url"
                type="url"
                inputMode="url"
                value={values.baseUrl}
                onChange={(event) => {
                  setBaseUrlTouched(true);
                  update({ baseUrl: event.target.value }, "baseUrl");
                }}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.baseUrl)}
                aria-describedby={cn(
                  "provider-base-url-hint",
                  fieldErrors.baseUrl && "provider-base-url-error",
                )}
                placeholder="https://api.openai.com/v1"
                className="font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <FieldDescription id="provider-base-url-hint" className="text-xs">
                Include the version path if the provider needs one, e.g.{" "}
                <code className="font-mono text-[11px]">/v1</code>.
              </FieldDescription>
              {fieldErrors.baseUrl ? (
                <FieldError id="provider-base-url-error">
                  {fieldErrors.baseUrl}
                </FieldError>
              ) : null}
            </Field>

            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Provider could not be saved</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>

          <DialogFooter className="shrink-0 border-t border-border/60 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              Add provider
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
