import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  KeyRoundIcon,
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

type ApiKey = {
  id: string;
  label: string;
  has_key: boolean;
  created_at: string;
  last_used_at: string | null;
};

type CreatedApiKey = {
  id: string;
  plaintextKey: string;
};

function formatDate(value: string | null): string {
  if (!value) return "Belum pernah";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak diketahui";

  return new Intl.DateTimeFormat("id-ID", {
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
      setLabelError("Masukkan label untuk API key ini.");
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
      toast.success(`API key "${key.label}" disalin ke clipboard`);
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

  function closePlaintextDialog() {
    setPlaintextKey(null);
    setCopyStatus("idle");
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/60"
              aria-hidden
            >
              <KeyRoundIcon className="size-4 text-muted-foreground" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle>Akses API</CardTitle>
              <CardDescription className="truncate">
                API key untuk CLI dan aplikasi Anda.
              </CardDescription>
            </div>
          </div>
          <CardAction className="shrink-0">
            <Button
              type="button"
              size="sm"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Buat key
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loadError || actionError ? (
            <Alert variant="destructive">
              <AlertTitle>API key tidak dapat diperbarui</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>{actionError ?? loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadKeys()}
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  Coba lagi
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              <Spinner />
              Memuat API key...
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
                    className="flex flex-col gap-3 p-3 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <KeyRoundIcon className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-sm font-medium">
                          {key.label}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {!key.has_key
                            ? "Key lama — salin tidak tersedia"
                            : key.last_used_at
                              ? `Terakhir digunakan ${formatDate(key.last_used_at)}`
                              : `Dibuat ${formatDate(key.created_at)}`}
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
                        aria-label={`Salin API key ${key.label}`}
                        title={
                          key.has_key
                            ? "Salin key"
                            : "Key ini dibuat sebelum enkripsi diaktifkan"
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
                        {isCopied ? "Tersalin" : "Salin"}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={isRevoking}
                            aria-label={`Cabut API key ${key.label}`}
                            title="Cabut key"
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
                              Cabut API key {key.label}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Key akan dihapus permanen dan tidak bisa digunakan
                              lagi.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isRevoking}>
                              Batal
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={isRevoking}
                              onClick={() => void handleRevoke(key)}
                            >
                              {isRevoking ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Cabut key
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
                <EmptyTitle>Belum ada API key</EmptyTitle>
                <EmptyDescription>
                  Buat key pertama Anda untuk mulai menggunakan CLI.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
        <CardFooter className="gap-2 border-t text-xs text-muted-foreground">
          <CircleAlertIcon className="size-3.5 shrink-0" />
          Key dapat dicabut kapan saja.
        </CardFooter>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat API key</DialogTitle>
            <DialogDescription>
              Beri label agar key ini mudah dikenali pada konfigurasi CLI.
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
                  placeholder="Claude Code di laptop"
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
                  Batal
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <KeyRoundIcon data-icon="inline-start" />
                  )}
                  Buat API key
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
            <DialogTitle>Simpan API key Anda</DialogTitle>
            <DialogDescription>
              Salin key ini sekarang. Setelah dialog ditutup, key tetap dapat
              disalin dari daftar.
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
                <AlertTitle>Key tidak dapat disalin otomatis</AlertTitle>
                <AlertDescription>
                  Salin nilai API key secara manual sebelum melanjutkan.
                </AlertDescription>
              </Alert>
            ) : null}
            <Alert>
              <AlertTitle id="new-api-key-warning">
                Jangan bagikan API key ini
              </AlertTitle>
              <AlertDescription>
                Key ini dapat digunakan untuk mengakses endpoint router atas
                nama Anda.
              </AlertDescription>
            </Alert>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closePlaintextDialog}
            >
              Saya sudah menyimpan key
            </Button>
            <Button type="button" onClick={() => void copyPlaintextKey()}>
              {copyStatus === "copied" ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              {copyStatus === "copied" ? "Tersalin" : "Salin key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { ApiKeyManager };
export default ApiKeyManager;
