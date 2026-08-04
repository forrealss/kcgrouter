import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";

type ApiKey = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
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
        <CardHeader>
          <CardTitle>API Access</CardTitle>
          <CardDescription>
            Kelola App API Key untuk mengautentikasi CLI ke endpoint router.
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Buat API key
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Memuat API key...
            </div>
          ) : keys?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead>Terakhir digunakan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const isRevoked = Boolean(key.revoked_at);
                  const isRevoking = revokingKeyId === key.id;

                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.label}</TableCell>
                      <TableCell>{formatDate(key.created_at)}</TableCell>
                      <TableCell>{formatDate(key.last_used_at)}</TableCell>
                      <TableCell>
                        <Badge variant={isRevoked ? "secondary" : "default"}>
                          {isRevoked ? "Dicabut" : "Aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isRevoked ? (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={isRevoking}
                              >
                                {isRevoking ? (
                                  <Spinner data-icon="inline-start" />
                                ) : (
                                  <Trash2Icon data-icon="inline-start" />
                                )}
                                Cabut
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Cabut API key {key.label}?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  CLI yang masih memakai key ini tidak akan
                                  dapat mengakses endpoint router lagi.
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
                                  Cabut API key
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRoundIcon />
                </EmptyMedia>
                <EmptyTitle>Belum ada API key</EmptyTitle>
                <EmptyDescription>
                  Buat key untuk menghubungkan CLI ke endpoint `/v1/*`.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
        <CardFooter className="border-t text-sm text-muted-foreground">
          API key plaintext hanya ditampilkan sekali setelah dibuat.
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
              Nilai ini hanya dapat dilihat sekarang. Salin dan simpan di tempat
              aman sebelum menutup dialog.
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
