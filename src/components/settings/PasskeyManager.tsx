import {
  FingerprintIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import {
  PasskeyCancelledError,
  passkeysSupported,
  registerPasskey,
} from "@/lib/passkey";
import type { Passkey } from "@/types/passkey";

const MAX_NAME_LENGTH = 64;

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Best-effort default name, e.g. "Chrome on macOS". */
function suggestName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "device";
  return `${browser} on ${os}`;
}

type NameDialog = { mode: "add" } | { mode: "rename"; passkey: Passkey } | null;

export function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<NameDialog>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const supported = passkeysSupported();
  const currentHost =
    typeof window !== "undefined" ? window.location.hostname : "";

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await apiClient.get<{ passkeys: Passkey[] }>(
        "/api/auth/passkeys",
      );
      setPasskeys(result.passkeys);
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd() {
    setName(suggestName());
    setNameError(null);
    setDialog({ mode: "add" });
  }

  function openRename(passkey: Passkey) {
    setName(passkey.name);
    setNameError(null);
    setDialog({ mode: "rename", passkey });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Name is required.");
      return;
    }

    setIsSaving(true);
    setNameError(null);
    try {
      if (dialog.mode === "add") {
        const created = await registerPasskey(trimmed);
        setPasskeys((prev) => [created, ...(prev ?? [])]);
        toast.success("Passkey added");
      } else {
        const result = await apiClient.patch<{ passkey: Passkey }>(
          `/api/auth/passkeys/${encodeURIComponent(dialog.passkey.id)}`,
          { name: trimmed },
        );
        setPasskeys((prev) =>
          (prev ?? []).map((p) =>
            p.id === result.passkey.id ? result.passkey : p,
          ),
        );
        toast.success("Passkey renamed");
      }
      setDialog(null);
    } catch (error) {
      // Closing the browser prompt keeps the dialog open so the user can retry.
      if (!(error instanceof PasskeyCancelledError)) {
        setNameError(getApiErrorMessage(error));
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(passkey: Passkey) {
    setDeletingId(passkey.id);
    try {
      await apiClient.delete(
        `/api/auth/passkeys/${encodeURIComponent(passkey.id)}`,
      );
      setPasskeys((prev) => (prev ?? []).filter((p) => p.id !== passkey.id));
      toast.success("Passkey removed");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  const count = passkeys?.length ?? 0;

  return (
    <>
      <Card
        className="gap-0 overflow-hidden py-0"
        aria-busy={isLoading || isSaving || Boolean(deletingId)}
      >
        <CardHeader className="grid-cols-[auto_1fr_auto] grid-rows-1 items-center gap-3 border-b border-border/60 bg-muted/20 px-5 py-3.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground"
            aria-hidden
          >
            <FingerprintIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium">Passkeys</CardTitle>
            <CardDescription className="text-xs">
              {isLoading
                ? "Loading passkeys…"
                : count === 0
                  ? "Sign in with fingerprint, face, or a security key."
                  : `${count} passkey${count === 1 ? "" : "s"} can sign in.`}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={openAdd}
            disabled={!supported || isLoading || isSaving}
            title={
              supported
                ? undefined
                : "Passkeys need HTTPS (or localhost) and a supported browser"
            }
          >
            <PlusIcon data-icon="inline-start" />
            Add passkey
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 px-5 py-4">
          {!supported ? (
            <Alert>
              <FingerprintIcon />
              <AlertTitle>Passkeys unavailable here</AlertTitle>
              <AlertDescription>
                Open the dashboard via a hostname over HTTPS (or on
                http://localhost) in a browser that supports passkeys to add
                one. IP addresses such as 127.0.0.1 do not work. Password
                sign-in keeps working either way.
              </AlertDescription>
            </Alert>
          ) : null}

          {loadError ? (
            <Alert variant="destructive">
              <AlertTitle>Passkeys could not be loaded</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void load()}
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
              <div className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-44 max-w-full" />
                </div>
              </div>
            </div>
          ) : passkeys?.length ? (
            <div className="flex flex-col divide-y rounded-lg border">
              {passkeys.map((passkey) => {
                const isDeleting = deletingId === passkey.id;
                // A passkey only works on the host it was registered on.
                const otherHost =
                  currentHost !== "" && passkey.rp_id !== currentHost;
                return (
                  <div
                    key={passkey.id}
                    className="flex flex-col gap-3 p-3 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-success/25 bg-success/10 text-success">
                        <FingerprintIcon className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {passkey.name}
                          </span>
                          {passkey.backed_up ? (
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px] font-normal"
                            >
                              Synced
                            </Badge>
                          ) : null}
                          {otherHost ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px] font-normal text-warning"
                              title={`Registered on ${passkey.rp_id}; works only there`}
                            >
                              {passkey.rp_id}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          Added {formatDate(passkey.created_at)}
                          <span aria-hidden> · </span>
                          {passkey.last_used_at
                            ? `last used ${formatDate(passkey.last_used_at)}`
                            : "never used"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pl-11 sm:shrink-0 sm:pl-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openRename(passkey)}
                        aria-label={`Rename passkey ${passkey.name}`}
                      >
                        <PencilIcon data-icon="inline-start" />
                        Rename
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={isDeleting}
                            aria-label={`Remove passkey ${passkey.name}`}
                            title="Remove passkey"
                          >
                            {isDeleting ? (
                              <Spinner />
                            ) : (
                              <Trash2Icon className="text-destructive" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Remove passkey {passkey.name}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              It will no longer sign in to KCG Router. You may
                              also want to delete it from your device or
                              password manager.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={isDeleting}
                              onClick={() => void handleDelete(passkey)}
                            >
                              Remove passkey
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !loadError ? (
            <Empty className="border-dashed py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FingerprintIcon />
                </EmptyMedia>
                <EmptyTitle>No passkeys yet</EmptyTitle>
                <EmptyDescription>
                  Add one to sign in without typing your password.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !isSaving) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "rename" ? "Rename passkey" : "Add passkey"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.mode === "rename"
                ? "Pick a name that tells you which device this is."
                : "Your browser will ask you to confirm with fingerprint, face, PIN, or a security key."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field data-invalid={Boolean(nameError)}>
                <FieldLabel htmlFor="passkey-name">Name</FieldLabel>
                <Input
                  id="passkey-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(null);
                  }}
                  maxLength={MAX_NAME_LENGTH}
                  disabled={isSaving}
                  aria-invalid={Boolean(nameError)}
                  autoFocus
                  required
                />
                {dialog?.mode === "add" ? (
                  <FieldDescription>
                    Works only on {currentHost || "this host"}.
                  </FieldDescription>
                ) : null}
                {nameError ? (
                  <FieldError aria-live="polite">{nameError}</FieldError>
                ) : null}
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Spinner data-icon="inline-start" /> : null}
                {dialog?.mode === "rename" ? "Save" : "Continue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
