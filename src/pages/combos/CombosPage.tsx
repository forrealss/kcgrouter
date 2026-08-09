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
  CardContent,
  CardDescription,
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
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-3"
      aria-hidden
    >
      <Skeleton className="size-8 rounded-md" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3.5 w-48" />
      </div>
      <Skeleton className="h-6 w-20 rounded-md" />
    </div>
  );
}

function MemberSummary({ members }: { members: ComboMember[] }) {
  if (members.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">Belum ada target</span>
    );
  }

  const visible = members.slice(0, MAX_VISIBLE_MEMBERS);
  const remaining = members.length - visible.length;

  return (
    <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
      {visible.map((member, index) => (
        <span key={member.id} className="flex min-w-0 items-center gap-1.5">
          {index > 0 ? <span className="text-border">→</span> : null}
          <span className="truncate">{member.modelName}</span>
        </span>
      ))}
      {remaining > 0 ? <Badge variant="secondary">+{remaining}</Badge> : null}
    </span>
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

  async function handleBuilderChanged(memberCount: number) {
    await refreshCombos();
    setBuilderCombo((current) =>
      current ? { ...current, memberCount } : current,
    );
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-4 pb-4"
      aria-label="Pengelolaan combo"
    >
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Combo routing
          </h2>
          <p className="text-sm text-muted-foreground">
            Kelola urutan target dan strategi routing.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
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
          <Button
            type="button"
            size="sm"
            onClick={() => createCombo.setIsOpen(true)}
          >
            <PlusIcon data-icon="inline-start" />
            Buat combo
          </Button>
        </div>
      </header>

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
          className="flex flex-col gap-2"
          role="status"
          aria-label="Memuat combo"
        >
          <ComboCardSkeleton />
          <ComboCardSkeleton />
          <ComboCardSkeleton />
          <ComboCardSkeleton />
        </div>
      ) : combos.length === 0 ? (
        <Empty className="border bg-card py-8">
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
        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden border-border/70 p-0 shadow-sm">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/15 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <Layers3Icon className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <CardTitle className="text-sm">Routing combos</CardTitle>
                <CardDescription className="truncate text-xs">
                  Urutan target dan strategi yang aktif.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
              {combos.length} total
            </Badge>
          </div>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
            <div className="flex flex-col divide-y">
              {combos.map((combo) => {
                const members = membersByCombo[combo.id] ?? [];
                const meta = getStrategyMeta(
                  combo.strategy,
                  combo.roundRobinCursor,
                );

                return (
                  <div
                    key={combo.id}
                    className="group flex min-w-0 items-center gap-3 p-3 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/30"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => setBuilderCombo(combo)}
                      aria-label={`Atur ${combo.name}`}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/60 text-muted-foreground">
                        <meta.Icon className="size-4" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-sm font-medium">
                          {combo.name}
                        </span>
                        <MemberSummary members={members} />
                      </span>
                    </button>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {combo.memberCount} target
                    </span>
                    <Badge
                      variant="outline"
                      className="hidden shrink-0 gap-1 font-normal md:inline-flex"
                    >
                      <meta.Icon className="size-3" />
                      {meta.label}
                    </Badge>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => setBuilderCombo(combo)}
                      >
                        Atur
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={isDeletingId === combo.id}
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
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
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
        <DialogContent className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b bg-muted/15 px-5 py-3 pr-12 sm:px-6">
            {builderCombo ? (
              <div className="flex min-w-0 items-center gap-2">
                <DialogTitle className="truncate text-base">
                  {builderCombo.name}
                </DialogTitle>
                <Badge variant="outline" className="shrink-0 font-normal">
                  {
                    getStrategyMeta(
                      builderCombo.strategy,
                      builderCombo.roundRobinCursor,
                    ).label
                  }
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {builderCombo.memberCount}
                </span>
              </div>
            ) : null}
          </DialogHeader>
          {builderCombo ? (
            <ComboBuilder
              combo={builderCombo}
              onChanged={handleBuilderChanged}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
