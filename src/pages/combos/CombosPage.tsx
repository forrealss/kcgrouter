import {
  AlertCircleIcon,
  GitForkIcon,
  Layers3Icon,
  PlusIcon,
  RefreshCwIcon,
  RepeatIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { ComboBuilder } from "@/components/combos/ComboBuilder";
import { CreateComboForm } from "@/components/combos/CreateComboForm";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useCombos, useCreateCombo } from "@/hooks/useCombos";
import type { Combo, ComboMember } from "@/types/combo";

const MAX_VISIBLE_MEMBERS = 4;

function getStrategyMeta(strategy: Combo["strategy"], cursor: number) {
  if (strategy === "fallback") {
    return {
      label: "Fallback",
      Icon: GitForkIcon,
      hint: "Urutan menentukan prioritas",
    };
  }
  return {
    label: "Round-robin",
    Icon: RepeatIcon,
    hint: `Cursor saat ini: ${cursor + 1}`,
  };
}

function ComboCardSkeleton() {
  return (
    <Card aria-hidden>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 w-32" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-3.5 w-24" />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
      </CardContent>
      <CardFooter className="justify-between">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-3.5 w-28" />
      </CardFooter>
    </Card>
  );
}

function MemberChain({ members }: { members: ComboMember[] }) {
  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
        Belum ada target model. Klik untuk menambahkan.
      </div>
    );
  }

  const visible = members.slice(0, MAX_VISIBLE_MEMBERS);
  const remaining = members.length - visible.length;

  return (
    <div className="flex flex-col">
      {visible.map((member, index) => (
        <div key={member.id}>
          <div className="flex items-center gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground">
              {index + 1}
            </span>
            <span className="truncate text-sm font-medium">
              {member.modelName}
            </span>
          </div>
          {index < visible.length - 1 ? (
            <span className="ml-[9px] block h-2 w-px bg-border" aria-hidden />
          ) : null}
        </div>
      ))}
      {remaining > 0 ? (
        <div className="mt-1 flex items-center gap-2.5">
          <span className="size-5 shrink-0" aria-hidden />
          <Badge variant="secondary">+{remaining} lainnya</Badge>
        </div>
      ) : null}
    </div>
  );
}

export function CombosPage() {
  const {
    combos,
    membersByCombo,
    isLoading,
    error,
    isDeletingId,
    refreshCombos,
    handleDeleteCombo,
  } = useCombos();

  const [builderCombo, setBuilderCombo] = useState<Combo | null>(null);

  const createCombo = useCreateCombo((combo) => {
    void refreshCombos();
    setBuilderCombo({ ...combo, memberCount: 0 });
  });

  return (
    <section className="flex flex-col gap-6" aria-label="Pengelolaan combo">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Combo routing</h2>
          <p className="text-sm text-muted-foreground">
            Susun target model untuk fallback atau distribusi round-robin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshCombos()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Muat ulang
          </Button>
          <Button type="button" onClick={() => createCombo.setIsOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Buat combo
          </Button>
        </div>
      </div>

      {/* Error */}
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

      {/* Content */}
      {isLoading && combos.length === 0 ? (
        <div
          className="grid gap-4 xl:grid-cols-2"
          role="status"
          aria-label="Memuat combo"
        >
          <ComboCardSkeleton />
          <ComboCardSkeleton />
          <ComboCardSkeleton />
          <ComboCardSkeleton />
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
            <Button onClick={() => createCombo.setIsOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Buat combo pertama
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {combos.map((combo) => {
            const members = membersByCombo[combo.id] ?? [];
            const meta = getStrategyMeta(
              combo.strategy,
              combo.roundRobinCursor,
            );

            return (
              <Card
                key={combo.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => setBuilderCombo(combo)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <meta.Icon className="size-4 text-muted-foreground" />
                    <span className="truncate">{combo.name}</span>
                  </CardTitle>
                  <CardDescription>
                    {combo.memberCount} target terdaftar
                  </CardDescription>
                  <CardAction>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={isDeletingId === combo.id}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Hapus ${combo.name}`}
                          title="Hapus combo"
                        >
                          {isDeletingId === combo.id ? (
                            <Spinner className="size-3" />
                          ) : (
                            <Trash2Icon className="size-3" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Hapus combo ini?</AlertDialogTitle>
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
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <MemberChain members={members} />
                </CardContent>
                <CardFooter className="justify-between gap-3">
                  <Badge variant="outline" className="gap-1 font-normal">
                    <meta.Icon className="size-3" />
                    {meta.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {meta.hint}
                  </span>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Combo Dialog */}
      <Dialog
        open={createCombo.isOpen}
        onOpenChange={createCombo.handleOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat combo</DialogTitle>
            <DialogDescription>
              Pilih strategi routing sebelum menambahkan target model.
            </DialogDescription>
          </DialogHeader>
          <CreateComboForm
            name={createCombo.name}
            strategy={createCombo.strategy}
            isCreating={createCombo.isCreating}
            error={createCombo.error}
            onNameChange={createCombo.setName}
            onStrategyChange={createCombo.setStrategy}
            onSubmit={createCombo.handleSubmit}
            onCancel={() => createCombo.handleOpenChange(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Combo Builder Dialog */}
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
