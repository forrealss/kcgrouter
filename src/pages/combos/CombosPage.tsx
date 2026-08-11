import {
  AlertCircleIcon,
  GitForkIcon,
  Layers3Icon,
  type LucideIcon,
  PlusIcon,
  RefreshCwIcon,
  RepeatIcon,
  Settings2Icon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { Card, CardContent, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import type { Combo, ComboMember } from "@/types/combo";

const MAX_VISIBLE_MEMBERS = 3;

function getStrategyMeta(strategy: Combo["strategy"], cursor: number) {
  if (strategy === "fallback") {
    return {
      label: "FALLBACK",
      Icon: GitForkIcon,
      hint: "Priority order",
      accentClassName:
        "border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }
  return {
    label: "ROUND-ROBIN",
    Icon: RepeatIcon,
    hint: `Cursor ${cursor + 1}`,
    accentClassName:
      "border-sky-500/35 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  };
}

function InventoryMetric({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "ok" | "info";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-card px-4 py-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border",
          tone === "ok" &&
            "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
          tone === "info" && "border-sky-500/30 bg-sky-500/10 text-sky-500",
          tone === "neutral" &&
            "border-border bg-muted/50 text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="font-mono text-base font-semibold tracking-tight tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

function ComboCardSkeleton() {
  return (
    <Card aria-hidden className="gap-0 overflow-hidden border-border/70 p-0">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-28" />
        </div>
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}

function MemberSummary({ members }: { members: ComboMember[] }) {
  if (members.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/15 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
        <TargetIcon className="size-3.5 shrink-0" />
        No targets configured
      </div>
    );
  }

  const visible = members.slice(0, MAX_VISIBLE_MEMBERS);
  const remaining = members.length - visible.length;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {visible.map((member) => (
        <span
          key={member.id}
          className="max-w-full truncate rounded-md border border-border/70 bg-muted/30 px-2 py-1 font-mono text-[11px] text-foreground/80"
          title={member.modelName}
        >
          {member.modelName}
        </span>
      ))}
      {remaining > 0 ? (
        <Badge variant="secondary" className="font-mono text-[10px]">
          +{remaining}
        </Badge>
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

  const summary = useMemo(
    () => ({
      targets: combos.reduce((total, combo) => total + combo.memberCount, 0),
      fallback: combos.filter((combo) => combo.strategy === "fallback").length,
      roundRobin: combos.filter((combo) => combo.strategy === "round_robin")
        .length,
    }),
    [combos],
  );

  async function handleBuilderChanged(memberCount: number) {
    await refreshCombos();
    setBuilderCombo((current) =>
      current ? { ...current, memberCount } : current,
    );
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-5 pb-4"
      aria-label="Combo management"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Manage target order and routing strategies.
        </p>
        <div className="flex flex-wrap gap-2">
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
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => createCombo.setIsOpen(true)}
          >
            <PlusIcon data-icon="inline-start" />
            Create combo
          </Button>
        </div>
      </header>

      <Card className="!py-0 overflow-hidden">
        <div className="grid gap-px bg-border/60 sm:grid-cols-3 [&>*]:bg-card">
          <InventoryMetric
            label="Combos"
            value={String(combos.length)}
            icon={Layers3Icon}
          />
          <InventoryMetric
            label="Active targets"
            value={String(summary.targets)}
            icon={TargetIcon}
            tone="ok"
          />
          <InventoryMetric
            label="Strategies"
            value={`${summary.fallback}/${summary.roundRobin}`}
            icon={GitForkIcon}
            tone="info"
          />
        </div>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Combos could not be loaded</AlertTitle>
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
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading && combos.length === 0 ? (
        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="Loading combos"
        >
          <ComboCardSkeleton />
          <ComboCardSkeleton />
          <ComboCardSkeleton />
        </div>
      ) : combos.length === 0 ? (
        <Empty className="min-h-72 border border-dashed bg-card/60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers3Icon />
            </EmptyMedia>
            <EmptyTitle>No combos yet</EmptyTitle>
            <EmptyDescription>
              Create a combo to configure provider and model order.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => createCombo.setIsOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Create your first combo
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <section
          className="flex min-h-0 flex-col gap-3"
          aria-label="Combo inventory"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Routing inventory
            </h2>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {combos.length} registered
            </Badge>
          </div>
          <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {combos.map((combo) => {
              const members = membersByCombo[combo.id] ?? [];
              const meta = getStrategyMeta(
                combo.strategy,
                combo.roundRobinCursor,
              );

              return (
                <Card
                  key={combo.id}
                  className="group gap-0 overflow-hidden border-border/80 bg-card py-0 shadow-sm transition-[border-color,box-shadow,background-color] duration-150 hover:border-primary/40 hover:bg-accent/20 dark:border-border/80 dark:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.9)] dark:hover:shadow-[0_0_24px_-12px] dark:hover:shadow-primary"
                >
                  <div className="flex min-w-0 items-center gap-3 border-b border-border/70 bg-muted/30 px-4 py-3 dark:bg-muted/40">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg border shadow-sm dark:shadow-[0_0_14px_-5px] dark:shadow-current",
                        meta.accentClassName,
                      )}
                    >
                      <meta.Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">
                        {combo.name}
                      </CardTitle>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/90">
                        {combo.memberCount === 0
                          ? "no targets"
                          : "routing target"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 font-mono text-[10px]",
                        meta.accentClassName,
                      )}
                    >
                      {meta.label}
                    </Badge>
                  </div>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <MemberSummary members={members} />
                    <div className="flex items-center justify-between gap-3 font-mono text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <TargetIcon className="size-3.5" />
                        {combo.memberCount} targets
                      </span>
                      <span className="truncate text-right">{meta.hint}</span>
                    </div>
                    <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setBuilderCombo(combo)}
                      >
                        <Settings2Icon data-icon="inline-start" />
                        Configure combo
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            disabled={isDeletingId === combo.id}
                            aria-label={`Delete ${combo.name}`}
                            title="Delete combo"
                          >
                            {isDeletingId === combo.id ? (
                              <Spinner className="size-3.5" />
                            ) : (
                              <Trash2Icon className="size-3.5" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete this combo?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Combo {combo.name} and all of its members will be
                              permanently deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              disabled={isDeletingId === combo.id}
                            >
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={isDeletingId === combo.id}
                              onClick={() => void handleDeleteCombo(combo.id)}
                            >
                              Delete combo
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <Dialog
        open={createCombo.isOpen}
        onOpenChange={createCombo.handleOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create combo</DialogTitle>
            <DialogDescription>
              Choose a routing strategy before adding model targets.
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
                <span className="font-mono text-xs text-muted-foreground">
                  {builderCombo.memberCount} targets
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
