import {
  AlertCircleIcon,
  GitForkIcon,
  Layers3Icon,
  type LucideIcon,
  PlusIcon,
  RefreshCwIcon,
  RepeatIcon,
  SearchIcon,
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useCombos, useCreateCombo } from "@/hooks/useCombos";
import { cn } from "@/lib/utils";
import type { Combo, ComboMember } from "@/types/combo";

/** Targets listed inline on a card before collapsing into a "+N" count. */
const MAX_VISIBLE_MEMBERS = 3;

interface StrategyMeta {
  label: string;
  Icon: LucideIcon;
  accentClassName: string;
  /** How the strategy picks a target, in one short phrase. */
  description: string;
}

function getStrategyMeta(strategy: Combo["strategy"]): StrategyMeta {
  if (strategy === "fallback") {
    return {
      label: "FALLBACK",
      Icon: GitForkIcon,
      accentClassName:
        "border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      description: "Tries targets in order, top first",
    };
  }
  return {
    label: "ROUND-ROBIN",
    Icon: RepeatIcon,
    accentClassName:
      "border-sky-500/35 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    description: "Spreads requests across targets",
  };
}

/**
 * Index the engine will pick next for a round-robin combo. Mirrors
 * combo-engine.service.ts, which starts scanning at `cursor + 1` and wraps —
 * so the stored cursor is the *last* used index, not the next one.
 */
function nextRoundRobinIndex(cursor: number, memberCount: number): number {
  if (memberCount === 0) return 0;
  return (cursor + 1) % memberCount;
}

function ComboCardSkeleton() {
  return (
    <Card aria-hidden className="gap-0 overflow-hidden border-border/70 py-0">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <CardContent className="flex flex-col gap-2 px-0 py-0">
        <div className="flex flex-col gap-2 px-4 py-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="border-t border-border/60 bg-muted/20 px-4 py-2.5">
          <Skeleton className="h-8 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Ordered target list. For `fallback` the order *is* the behaviour, so targets
 * are numbered rows rather than loose chips; round-robin highlights whichever
 * target the engine will reach for next.
 */
function TargetList({
  members,
  strategy,
  cursor,
}: {
  members: ComboMember[];
  strategy: Combo["strategy"];
  cursor: number;
}) {
  if (members.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/15 px-3 py-3 text-xs text-muted-foreground">
        <TargetIcon className="size-3.5 shrink-0" aria-hidden />
        No targets yet — this combo cannot serve traffic.
      </div>
    );
  }

  const visible = members.slice(0, MAX_VISIBLE_MEMBERS);
  const remaining = members.length - visible.length;
  const nextIndex =
    strategy === "round_robin"
      ? nextRoundRobinIndex(cursor, members.length)
      : 0;

  return (
    <ol className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-md border border-border/60">
      {visible.map((member, index) => {
        const isNext = index === nextIndex;
        return (
          <li
            key={member.id}
            className={cn(
              "relative flex items-center gap-2.5 px-2.5 py-2",
              "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
              isNext
                ? "bg-emerald-500/[0.06] before:bg-emerald-500/70"
                : "before:bg-transparent",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] tabular-nums",
                isNext
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {index + 1}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90"
              title={member.modelName}
            >
              {member.modelName}
            </span>
            {isNext ? (
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                next
              </span>
            ) : null}
          </li>
        );
      })}
      {remaining > 0 ? (
        <li className="flex items-center justify-between gap-2 px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>+{remaining} more</span>
          {/* The highlighted row is hidden in the collapsed tail, so say where. */}
          {nextIndex >= visible.length ? (
            <span className="uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              next is #{nextIndex + 1}
            </span>
          ) : null}
        </li>
      ) : null}
    </ol>
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
  const [query, setQuery] = useState("");

  const createCombo = useCreateCombo((combo) => {
    void refreshCombos();
    setBuilderCombo({ ...combo, memberCount: 0 });
  });

  const summary = useMemo(
    () => ({
      targets: combos.reduce((total, combo) => total + combo.memberCount, 0),
      empty: combos.filter((combo) => combo.memberCount === 0).length,
      fallback: combos.filter((combo) => combo.strategy === "fallback").length,
    }),
    [combos],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return combos;
    return combos.filter(
      (combo) =>
        combo.name.toLowerCase().includes(q) ||
        (membersByCombo[combo.id] ?? []).some((member) =>
          member.modelName.toLowerCase().includes(q),
        ),
    );
  }, [combos, membersByCombo, query]);

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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-72 sm:flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search combos or targets"
            aria-label="Search combos"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
            disabled={combos.length === 0}
          />
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
            Refresh
          </Button>
          <Button type="button" onClick={() => createCombo.setIsOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Create combo
          </Button>
        </div>
      </header>

      <Card className="!py-0 overflow-hidden">
        <div className="grid gap-px bg-border/60 sm:grid-cols-3 [&>*]:bg-card">
          <div className="flex min-w-0 items-center gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
              <Layers3Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                Combos
              </p>
              <p className="font-mono text-base font-semibold tracking-tight tabular-nums">
                {combos.length}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
              <TargetIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                Targets
              </p>
              <p className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-semibold tracking-tight tabular-nums">
                  {summary.targets}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  across all combos
                </span>
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 px-4 py-3">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md border",
                summary.empty > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                  : "border-border bg-muted/50 text-muted-foreground",
              )}
            >
              <AlertCircleIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                Not routable
              </p>
              <p className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "font-mono text-base font-semibold tracking-tight tabular-nums",
                    summary.empty > 0 && "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {summary.empty}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {summary.empty > 0 ? "have no targets" : "all configured"}
                </span>
              </p>
            </div>
          </div>
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
              A combo routes one model name across several provider connections.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => createCombo.setIsOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Create your first combo
            </Button>
          </EmptyContent>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty className="min-h-48 border border-dashed bg-card/60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No combos match “{query.trim()}”</EmptyTitle>
            <EmptyDescription>
              Searches cover combo names and target model names.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((combo) => {
            const members = membersByCombo[combo.id] ?? [];
            const meta = getStrategyMeta(combo.strategy);
            const isEmpty = combo.memberCount === 0;

            return (
              <Card
                key={combo.id}
                className={cn(
                  "flex flex-col gap-0 overflow-hidden border-border/80 py-0 shadow-sm transition-colors duration-150",
                  isEmpty && "border-amber-500/35",
                )}
              >
                <div className="flex min-w-0 items-start gap-3 border-b border-border/60 px-4 py-3.5">
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg border",
                      meta.accentClassName,
                    )}
                    aria-hidden
                  >
                    <meta.Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-sm font-medium">
                      {combo.name}
                    </CardTitle>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {meta.description}
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

                <CardContent className="flex flex-1 flex-col gap-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {combo.strategy === "fallback"
                        ? "Priority order"
                        : "Rotation"}
                    </p>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {combo.memberCount}{" "}
                      {combo.memberCount === 1 ? "target" : "targets"}
                    </span>
                  </div>
                  <TargetList
                    members={members}
                    strategy={combo.strategy}
                    cursor={combo.roundRobinCursor}
                  />
                </CardContent>

                <div className="flex items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setBuilderCombo(combo)}
                  >
                    <Settings2Icon data-icon="inline-start" />
                    {isEmpty ? "Add targets" : "Configure"}
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
                          Delete {combo.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          The combo and all {combo.memberCount} of its targets
                          will be permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingId === combo.id}>
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
            <DialogTitle>Create combo</DialogTitle>
            <DialogDescription>
              Add model targets after creating it.
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
                  {getStrategyMeta(builderCombo.strategy).label}
                </Badge>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
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
