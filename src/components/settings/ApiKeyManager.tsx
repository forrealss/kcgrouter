import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

type ApiKey = {
  id: string;
  label: string;
  has_key: boolean;
  created_at: string;
  last_used_at: string | null;
  /** Last 4 chars, so a key is identifiable without revealing it. */
  last4: string | null;
};

type CreatedApiKey = {
  id: string;
  plaintextKey: string;
};

function formatDate(value: string | null): string {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [copyingKeyId, setCopyingKeyId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [plaintextKey, setPlaintextKey] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const loadKeys = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError(null);
    setActionError(null);

    try {
      const data = await apiClient.get<ApiKey[]>("/api/settings/api-keys", {
        signal,
      });
      setKeys(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setLoadError(getApiErrorMessage(error));
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadKeys(controller.signal);

    return () => controller.abort();
  }, [loadKeys]);

  function handleCreateDialogChange(open: boolean) {
    if (isCreating) return;
    setIsCreateDialogOpen(open);
    if (!open) {
      setLabel("");
      setLabelError(null);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedLabel = label.trim();

    if (!normalizedLabel) {
      setLabelError("Enter a label for this API key.");
      return;
    }

    setLabelError(null);
    setActionError(null);
    setIsCreating(true);

    try {
      const created = await apiClient.post<CreatedApiKey>(
        "/api/settings/api-keys",
        { label: normalizedLabel },
      );
      setPlaintextKey(created.plaintextKey);
      setCopyStatus("idle");
      setIsCreateDialogOpen(false);
      setLabel("");
      await loadKeys();
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevoke(key: ApiKey) {
    setActionError(null);
    setRevokingKeyId(key.id);

    try {
      await apiClient.delete(
        `/api/settings/api-keys/${encodeURIComponent(key.id)}`,
      );
      await loadKeys();
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setRevokingKeyId(null);
    }
  }

  async function handleCopyKey(key: ApiKey) {
    setCopyingKeyId(key.id);

    try {
      const res = await apiClient.get<{ key: string }>(
        `/api/settings/api-keys/${encodeURIComponent(key.id)}/key`,
      );
      await navigator.clipboard.writeText(res.key);
      setCopiedKeyId(key.id);
      toast.success(`API key "${key.label}" copied to the clipboard`);
      setTimeout(() => {
        setCopiedKeyId((current) => (current === key.id ? null : current));
      }, 2000);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCopyingKeyId(null);
    }
  }

  async function copyPlaintextKey() {
    if (!plaintextKey) return;

    try {
      await navigator.clipboard.writeText(plaintextKey);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  const keyCount = keys?.length ?? 0;
  const legacyCount = keys?.filter((key) => !key.has_key).length ?? 0;

  function closePlaintextDialog() {
    setPlaintextKey(null);
    setCopyStatus("idle");
  }

  return (
    <>
      <Card
        className="gap-0 overflow-hidden py-0"
        aria-busy={isLoading || isCreating || Boolean(revokingKeyId)}
      >
        <CardHeader className="grid-cols-[auto_1fr_auto] grid-rows-1 items-center gap-3 border-b border-border/60 bg-muted/20 px-5 py-3.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground"
            aria-hidden
          >
            <KeyRoundIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium">API keys</CardTitle>
            <CardDescription className="text-xs">
              {isLoading
                ? "Loading credentials…"
                : keyCount === 0
                  ? "No credentials yet."
                  : `${keyCount} key${keyCount === 1 ? "" : "s"} clients can authenticate with.`}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setIsCreateDialogOpen(true)}
            disabled={isLoading || isCreating}
          >
            <PlusIcon data-icon="inline-start" />
            Create key
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-5 py-4">
          {loadError || actionError ? (
            <Alert variant="destructive">
              <AlertTitle>
                {loadError && !actionError
                  ? "API keys could not be loaded"
                  : "API key could not be updated"}
              </AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>{actionError ?? loadError}</p>
                {loadError && keys?.length ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-amber-600 dark:text-amber-400">
                    Showing last known key state
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadKeys()}
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {isLoading ? (
            <div
              className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border"
              aria-hidden
            >
              {["a", "b"].map((key) => (
                <div key={key} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-8 shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-2.5 w-44 max-w-full" />
                  </div>
                  <Skeleton className="h-8 w-20 shrink-0" />
                </div>
              ))}
            </div>
          ) : keys?.length ? (
            <div className="flex flex-col divide-y rounded-lg border">
              {keys.map((key) => {
                const isRevoking = revokingKeyId === key.id;
                const isCopying = copyingKeyId === key.id;
                const isCopied = copiedKeyId === key.id;

                return (
                  <div
                    key={key.id}
                    className="flex flex-col gap-3 p-3 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-md border ${
                          key.has_key
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
                            : "border-muted-foreground/20 bg-muted text-muted-foreground"
                        }`}
                      >
                        <KeyRoundIcon className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {key.label}
                          </span>
                          {key.last4 ? (
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                              ••{key.last4}
                            </span>
                          ) : null}
                          {!key.has_key ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 gap-1 text-[10px] font-normal text-amber-600 dark:text-amber-400"
                            >
                              <TriangleAlertIcon className="size-3" />
                              Legacy
                            </Badge>
                          ) : null}
                        </span>
                        {/* Both dates matter: creation tells you how old the key
                            is, last-used whether anything still relies on it. */}
                        <span className="truncate text-[11px] text-muted-foreground">
                          Created {formatDate(key.created_at)}
                          <span aria-hidden> · </span>
                          {key.last_used_at
                            ? `last used ${formatDate(key.last_used_at)}`
                            : "never used"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pl-11 sm:shrink-0 sm:pl-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCopyKey(key)}
                        disabled={isCopying || !key.has_key}
                        aria-label={`Copy API key ${key.label}`}
                        title={
                          key.has_key
                            ? "Copy key"
                            : "Created before encryption was enabled"
                        }
                      >
                        {isCopying ? (
                          <Spinner data-icon="inline-start" />
                        ) : isCopied ? (
                          <CheckIcon
                            data-icon="inline-start"
                            className="text-green-600 dark:text-green-400"
                          />
                        ) : (
                          <CopyIcon data-icon="inline-start" />
                        )}
                        {isCopied ? "Copied" : "Copy"}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={isRevoking}
                            aria-label={`Revoke API key ${key.label}`}
                            title="Revoke key"
                          >
                            {isRevoking ? (
                              <Spinner />
                            ) : (
                              <Trash2Icon className="text-destructive" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Revoke API key {key.label}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isRevoking}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={isRevoking}
                              onClick={() => void handleRevoke(key)}
                            >
                              {isRevoking ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Revoke key
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty className="border-dashed py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRoundIcon />
                </EmptyMedia>
                <EmptyTitle>No API keys yet</EmptyTitle>
                <EmptyDescription>
                  Create one to start using the CLI.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>

        {legacyCount > 0 ? (
          <div className="border-t border-border/60 bg-muted/20 px-5 py-2.5">
            <p className="text-[11px] text-muted-foreground">
              {legacyCount} key{legacyCount === 1 ? "" : "s"} predate encrypted
              storage, so the value can no longer be read back. Recreate them to
              copy the key again.
            </p>
          </div>
        ) : null}
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              A label makes it easy to identify later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <FieldGroup>
              <Field data-invalid={Boolean(labelError)}>
                <FieldLabel htmlFor="api-key-label">Label</FieldLabel>
                <Input
                  id="api-key-label"
                  value={label}
                  onChange={(event) => {
                    setLabel(event.target.value);
                    setLabelError(null);
                  }}
                  disabled={isCreating}
                  aria-invalid={Boolean(labelError)}
                  autoFocus
                  placeholder="Claude Code on laptop"
                  required
                />
                <FieldError>{labelError}</FieldError>
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCreateDialogChange(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <KeyRoundIcon data-icon="inline-start" />
                  )}
                  Create API key
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(plaintextKey)}
        onOpenChange={(open) => {
          if (!open) closePlaintextDialog();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription>
              Also copyable from the list later.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-api-key">API key</FieldLabel>
              <Input
                id="new-api-key"
                value={plaintextKey ?? ""}
                readOnly
                aria-describedby="new-api-key-warning"
              />
            </Field>
            {copyStatus === "error" ? (
              <Alert variant="destructive">
                <AlertTitle>Key could not be copied automatically</AlertTitle>
                <AlertDescription>
                  Copy the API key value manually before continuing.
                </AlertDescription>
              </Alert>
            ) : null}
            <Alert>
              <AlertTitle id="new-api-key-warning">
                Do not share this API key
              </AlertTitle>
              <AlertDescription>
                It grants full access to the router endpoint.
              </AlertDescription>
            </Alert>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closePlaintextDialog}
            >
              I have saved the key
            </Button>
            <Button type="button" onClick={() => void copyPlaintextKey()}>
              {copyStatus === "copied" ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              {copyStatus === "copied" ? "Copied" : "Copy key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { ApiKeyManager };
export default ApiKeyManager;
