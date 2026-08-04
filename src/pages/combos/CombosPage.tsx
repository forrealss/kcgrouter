import {
  AlertCircleIcon,
  Layers3Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
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
import { Spinner } from "@/components/ui/spinner";
import { useCombos, useCreateCombo } from "@/hooks/useCombos";
import type { Combo } from "@/types/combo";

function strategyLabel(strategy: Combo["strategy"]): string {
  return strategy === "fallback" ? "Fallback" : "Round-robin";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Combo routing</h2>
          <p className="text-sm text-muted-foreground">
            Susun target model untuk fallback atau distribusi round-robin.
          </p>
        </div>
        <Button onClick={() => createCombo.setIsOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Buat combo
        </Button>
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
