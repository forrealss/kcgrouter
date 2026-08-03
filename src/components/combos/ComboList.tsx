import {
  AlertCircleIcon,
  Layers3Icon,
  PencilIcon,
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { ComboBuilder } from "./ComboBuilder";
import type { Combo, ComboMember } from "./types";

export type { Combo, ComboMember } from "./types";

type MemberMap = Record<string, ComboMember[]>;

function comboMembersPath(comboId: string): string {
  return `/api/combos/${encodeURIComponent(comboId)}/members`;
}

function strategyLabel(strategy: Combo["strategy"]): string {
  return strategy === "fallback" ? "Fallback" : "Round-robin";
}

export function ComboList() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [membersByCombo, setMembersByCombo] = useState<MemberMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [builderCombo, setBuilderCombo] = useState<Combo | null>(null);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState<Combo["strategy"]>("fallback");
  const [createError, setCreateError] = useState<string | null>(null);

  const refreshCombos = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const nextCombos = await apiClient.get<Combo[]>("/api/combos");
      const members = await Promise.all(
        nextCombos.map(async (combo) => {
          const comboMembers = await apiClient.get<ComboMember[]>(
            comboMembersPath(combo.id),
          );
          return [
            combo.id,
            [...comboMembers].sort(
              (left, right) => left.priority - right.priority,
            ),
          ] as const;
        }),
      );

      setCombos(nextCombos);
      setMembersByCombo(Object.fromEntries(members));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCombos();
  }, [refreshCombos]);

  function resetCreateForm() {
    setName("");
    setStrategy("fallback");
    setCreateError(null);
  }

  function handleCreateDialogChange(open: boolean) {
    setIsCreateDialogOpen(open);
    if (!open && !isCreating) resetCreateForm();
  }

  async function handleCreateCombo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);

    if (!name.trim()) {
      setCreateError("Nama combo wajib diisi.");
      return;
    }

    setIsCreating(true);
    try {
      const combo = await apiClient.post<Omit<Combo, "memberCount">>(
        "/api/combos",
        {
          name: name.trim(),
          strategy,
        },
      );
      resetCreateForm();
      setIsCreateDialogOpen(false);
      await refreshCombos();
      setBuilderCombo({ ...combo, memberCount: 0 });
    } catch (requestError) {
      setCreateError(getApiErrorMessage(requestError));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteCombo(comboId: string) {
    setError(null);
    setIsDeletingId(comboId);

    try {
      await apiClient.delete<{ ok: true }>(
        `/api/combos/${encodeURIComponent(comboId)}`,
      );
      if (builderCombo?.id === comboId) setBuilderCombo(null);
      await refreshCombos();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsDeletingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-6" aria-label="Pengelolaan combo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Combo routing</h2>
          <p className="text-sm text-muted-foreground">
            Susun target model untuk fallback atau distribusi round-robin.
          </p>
        </div>
        <Dialog
          open={isCreateDialogOpen}
          onOpenChange={handleCreateDialogChange}
        >
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Buat combo
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat combo</DialogTitle>
              <DialogDescription>
                Pilih strategi routing sebelum menambahkan target model.
              </DialogDescription>
            </DialogHeader>
            <form id="create-combo-form" onSubmit={handleCreateCombo}>
              <FieldGroup className="gap-4">
                <Field data-invalid={Boolean(createError)}>
                  <FieldLabel htmlFor="combo-name">Nama combo</FieldLabel>
                  <Input
                    id="combo-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="mis. production-default"
                    aria-invalid={Boolean(createError)}
                    disabled={isCreating}
                    required
                    autoFocus
                  />
                  {createError ? <FieldError>{createError}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="combo-strategy">Strategi</FieldLabel>
                  <Select
                    value={strategy}
                    onValueChange={(value) =>
                      setStrategy(value as Combo["strategy"])
                    }
                    disabled={isCreating}
                  >
                    <SelectTrigger id="combo-strategy" className="w-full">
                      <SelectValue placeholder="Pilih strategi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="fallback">Fallback</SelectItem>
                        <SelectItem value="round_robin">Round-robin</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </form>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isCreating}>
                  Batal
                </Button>
              </DialogClose>
              <Button
                type="submit"
                form="create-combo-form"
                disabled={isCreating}
              >
                {isCreating ? <Spinner data-icon="inline-start" /> : null}
                Buat combo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Combo tidak dapat dimuat</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => void refreshCombos()}
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
          Memuat combo…
        </div>
      ) : combos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers3Icon />
            </EmptyMedia>
            <EmptyTitle>Belum ada combo</EmptyTitle>
            <EmptyDescription>
              Buat combo untuk mulai mengatur urutan provider dan model.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Buat combo pertama
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {combos.map((combo) => {
            const members = membersByCombo[combo.id] ?? [];

            return (
              <Card key={combo.id}>
                <CardHeader>
                  <CardTitle>{combo.name}</CardTitle>
                  <CardDescription>
                    {combo.memberCount} target terdaftar
                  </CardDescription>
                  <CardAction>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Kelola ${combo.name}`}
                        title="Kelola anggota"
                        onClick={() => setBuilderCombo(combo)}
                      >
                        <PencilIcon data-icon="inline-start" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Hapus ${combo.name}`}
                            title="Hapus combo"
                            disabled={isDeletingId === combo.id}
                          >
                            {isDeletingId === combo.id ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <Trash2Icon data-icon="inline-start" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Hapus combo ini?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Combo {combo.name} beserta seluruh anggotanya akan
                              dihapus permanen.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              disabled={isDeletingId === combo.id}
                            >
                              Batal
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={isDeletingId === combo.id}
                              onClick={() => void handleDeleteCombo(combo.id)}
                            >
                              Hapus combo
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada target model.
                    </p>
                  ) : (
                    <ol className="flex list-none flex-wrap gap-2">
                      {members.map((member, index) => (
                        <li key={member.id}>
                          <Badge variant="secondary">
                            {index + 1}. {member.modelName}
                          </Badge>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
                <CardFooter className="justify-between gap-3">
                  <Badge variant="outline">
                    {strategyLabel(combo.strategy)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {combo.strategy === "round_robin"
                      ? `Cursor saat ini: ${combo.roundRobinCursor + 1}`
                      : "Urutan menentukan prioritas"}
                  </span>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={builderCombo !== null}
        onOpenChange={(open) => {
          if (!open) setBuilderCombo(null);
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Combo builder</DialogTitle>
            <DialogDescription>
              Tambahkan dan urutkan anggota combo tanpa meninggalkan daftar.
            </DialogDescription>
          </DialogHeader>
          {builderCombo ? (
            <ComboBuilder combo={builderCombo} onChanged={refreshCombos} />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
