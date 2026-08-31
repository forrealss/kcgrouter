import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ChevronsUpIcon,
  GripVerticalIcon,
  KeyRoundIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlugZapIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AccountFormDialog } from "@/components/providers/AccountFormDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TestStatusValue } from "@/hooks/useProviderDetail";
import { formatDate } from "@/lib/provider-errors";
import {
  accountStatusMeta,
  cooldownRemainingSeconds,
  resolveAccountStatus,
} from "@/lib/provider-status";
import { cn } from "@/lib/utils";
import type { Provider, ProviderAccount } from "@/types/provider";

interface ProviderDetailConnectionsProps {
  provider: Provider;
  accounts: ProviderAccount[];
  deletingAccountId: string | null;
  testingAccountId: string | null;
  accountTestStatus: Record<string, TestStatusValue>;
  isReorderingAccounts: boolean;
  onDeleteAccount: (account: ProviderAccount) => void;
  onAccountSaved: () => void;
  onTestConnection: (account: ProviderAccount) => void;
  onToggleAccount: (account: ProviderAccount) => void;
  /** Receives the already-reordered list, top-first. */
  onReorderAccounts: (ordered: ProviderAccount[]) => void;
}

/** Move an item between two positions, returning a new array. */
function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0) return items;
  if (from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (!moved) return items;
  next.splice(to, 0, moved);
  return next;
}

/**
 * Re-renders every second while at least one account is cooling down, so the
 * remaining-time label ticks down instead of freezing at mount time. The
 * interval tears itself down as soon as every cooldown has expired.
 */
function useCooldownTick(accounts: ProviderAccount[]): void {
  const [, setNow] = useState(() => Date.now());

  useEffect(() => {
    const cooling = accounts.some(
      (a) => cooldownRemainingSeconds(a.cooldownUntil) > 0,
    );
    if (!cooling) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      const stillCooling = accounts.some(
        (a) => cooldownRemainingSeconds(a.cooldownUntil) > 0,
      );
      if (!stillCooling) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [accounts]);
}

/** 1 → "1st". Reads better than "position 1" for a failover order. */
function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

/**
 * Position readout flanked by its two move buttons: `↑ 2 ↓`.
 *
 * Side by side rather than stacked — a stacked pair has to split one row's
 * height between two targets, which lands around 16px each and is too small to
 * hit reliably, especially by thumb. Laid out horizontally each button gets a
 * full-height target and the number sits between them, so which direction it
 * moves is legible without reading the icons.
 */
function OrderControls({
  index,
  total,
  label,
  canReorder,
  onMove,
  className,
  buttonClassName,
}: {
  index: number;
  total: number;
  label: string;
  canReorder: boolean;
  onMove: (from: number, to: number) => void;
  className?: string;
  buttonClassName?: string;
}) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div className={cn("flex items-center", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "text-muted-foreground/70 hover:text-foreground",
              buttonClassName,
            )}
            disabled={isFirst || !canReorder}
            onClick={() => onMove(index, index - 1)}
          >
            <ArrowUpIcon />
            <span className="sr-only">Try {label} earlier</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Move up — tried earlier</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="w-4 cursor-default text-center font-mono text-[11px] tabular-nums text-muted-foreground"
            aria-hidden
          >
            {index + 1}
          </span>
        </TooltipTrigger>
        <TooltipContent>Tried {ordinal(index + 1)}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "text-muted-foreground/70 hover:text-foreground",
              buttonClassName,
            )}
            disabled={isLast || !canReorder}
            onClick={() => onMove(index, index + 1)}
          >
            <ArrowDownIcon />
            <span className="sr-only">Try {label} later</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Move down — tried later</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function ProviderDetailConnections({
  provider,
  accounts,
  deletingAccountId,
  testingAccountId,
  accountTestStatus,
  isReorderingAccounts,
  onDeleteAccount,
  onAccountSaved,
  onTestConnection,
  onToggleAccount,
  onReorderAccounts,
}: ProviderDetailConnectionsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ProviderAccount | null>(
    null,
  );
  /**
   * Drag state lives in refs, not state.
   *
   * `dragstart` and the first `dragenter` can arrive within the same React
   * batch, so a state-based `dragIndex` is still null when that first
   * `dragenter` reads it — the drop target never gets recorded and the drop
   * silently does nothing. Refs are written synchronously, so the sequence
   * holds regardless of when React re-renders.
   */
  const dragIdRef = useRef<string | null>(null);
  /** Live preview of the reordered list while a drag is in progress. */
  const [preview, setPreview] = useState<ProviderAccount[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /**
   * Connection awaiting delete confirmation.
   *
   * One dialog for the whole list rather than one per row: the trigger now
   * lives inside a dropdown, and a dialog nested in a menu that unmounts on
   * select loses its own trigger mid-transition.
   */
  const [pendingDelete, setPendingDelete] = useState<ProviderAccount | null>(
    null,
  );
  useCooldownTick(accounts);

  const canReorder = accounts.length > 1 && !isReorderingAccounts;
  // Render the preview while dragging so rows visibly shift under the cursor.
  const rows = preview ?? accounts;

  function handleMove(from: number, to: number) {
    if (!canReorder) return;
    const next = moveItem(accounts, from, to);
    if (next !== accounts) onReorderAccounts(next);
  }

  function handleDragStart(account: ProviderAccount) {
    dragIdRef.current = account.id;
    setDraggingId(account.id);
    setPreview(accounts);
  }

  /** Reorder the preview as the pointer passes over each row. */
  function handleDragEnter(index: number) {
    const draggedId = dragIdRef.current;
    if (!draggedId) return;
    setPreview((current) => {
      const list = current ?? accounts;
      const from = list.findIndex((a) => a.id === draggedId);
      if (from === -1 || from === index) return list;
      return moveItem(list, from, index);
    });
  }

  function handleDragEnd() {
    const draggedId = dragIdRef.current;
    dragIdRef.current = null;
    setDraggingId(null);

    const finalOrder = preview;
    setPreview(null);
    if (!draggedId || !finalOrder) return;

    // Only persist when the drag actually changed something.
    const changed = finalOrder.some((a, i) => a.id !== accounts[i]?.id);
    if (changed) onReorderAccounts(finalOrder);
  }

  function handleAdd() {
    setEditingAccount(null);
    setIsDialogOpen(true);
  }

  function handleEdit(account: ProviderAccount) {
    setEditingAccount(account);
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
    setEditingAccount(null);
  }

  function handleSaved() {
    handleCloseDialog();
    onAccountSaved();
  }

  // "Ready to serve traffic" has to mean in rotation, not merely healthy — a
  // disabled connection is active as far as the status column is concerned.
  const readyCount = accounts.filter(
    (a) => a.enabled && a.status === "active",
  ).length;
  const disabledCount = accounts.filter((a) => !a.enabled).length;

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="gap-1 border-b border-border/60 bg-muted/20 px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            Connections
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
              {accounts.length}
            </span>
          </CardTitle>
          <CardDescription>
            {accounts.length === 0
              ? `Credentials ${provider.name} uses to authenticate.`
              : `${readyCount} of ${accounts.length} ready to serve traffic${
                  disabledCount > 0 ? ` · ${disabledCount} disabled` : ""
                }. Tried top to bottom.`}
          </CardDescription>
          <CardAction>
            <Button type="button" size="sm" onClick={handleAdd}>
              <PlusIcon data-icon="inline-start" />
              Add connection
            </Button>
          </CardAction>
        </CardHeader>

        {/*
          Rows carry their own dividers and left rail, so the list runs edge to
          edge — an outer inset plus per-row borders read as two frames around
          the same list. The empty state still needs its padding.
        */}
        <CardContent
          className={accounts.length === 0 ? "px-5 py-4" : "px-0 py-0"}
        >
          {accounts.length === 0 ? (
            <Empty className="gap-4 border border-dashed bg-muted/10 p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRoundIcon />
                </EmptyMedia>
                <EmptyTitle className="text-base">
                  No credentials yet
                </EmptyTitle>
                <EmptyDescription>
                  Add an API key to start routing requests through{" "}
                  {provider.name}.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAdd}
                >
                  <PlusIcon data-icon="inline-start" />
                  Add connection
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <TooltipProvider delayDuration={200}>
              {/*
                An ordered list, because the order is the failover order rather
                than presentation: the first entry is the connection the router
                tries first.
              */}
              <ol
                className="flex flex-col divide-y divide-border/60"
                aria-label={`${provider.name} connection order`}
              >
                {rows.map((account, index) => {
                  const isDeleting = deletingAccountId === account.id;
                  const isTesting = testingAccountId === account.id;
                  const testStatus = accountTestStatus[account.id];
                  const statusKey = resolveAccountStatus(account);
                  const status = accountStatusMeta[statusKey];
                  const remaining = cooldownRemainingSeconds(
                    account.cooldownUntil,
                  );
                  const isDragging = draggingId === account.id;
                  const isFirst = index === 0;

                  return (
                    <li
                      key={account.id}
                      // Native DnD needs no dependency, and the menu below keeps
                      // the same reordering reachable by keyboard.
                      draggable={canReorder}
                      onDragStart={() => handleDragStart(account)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnd={handleDragEnd}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleDragEnd();
                      }}
                      className={cn(
                        // Mobile stacks: identity on top, then meta, then a
                        // full-width control strip. Squeezing four zones onto
                        // one line at 360px left every one of them truncated.
                        "group/conn relative flex flex-col gap-2 py-3 pl-4 pr-3 transition-colors",
                        "md:flex-row md:items-center md:gap-3 md:py-2.5 md:pl-5",
                        // Left rail mirrors the Models list: state is readable
                        // down the edge without a badge per row.
                        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:transition-colors",
                        account.enabled
                          ? "before:bg-success/80 hover:bg-success/[0.04] dark:before:shadow-[0_0_8px] dark:before:shadow-success/60"
                          : "bg-muted/30 before:bg-transparent hover:bg-muted/50",
                        statusKey === "error" &&
                          "bg-destructive/5 before:bg-destructive/80 hover:bg-destructive/10 dark:before:shadow-destructive/60",
                        statusKey === "cooldown" &&
                          "before:bg-warning/80 dark:before:shadow-warning/60",
                        isDragging && "bg-primary/5 before:bg-primary",
                      )}
                    >
                      {/*
                        Grip + arrows, drawn at rest rather than on hover: a
                        handle you have to discover by hovering is a handle most
                        people never find, and hover does not exist on touch at
                        all. Desktop only — on mobile the same arrows move to
                        the control strip, where they get a thumb-sized target.
                      */}
                      <div className="hidden shrink-0 items-center gap-1 md:flex">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "flex items-center transition-colors",
                                canReorder
                                  ? "cursor-grab text-muted-foreground/50 active:cursor-grabbing group-hover/conn:text-muted-foreground"
                                  : "text-muted-foreground/25",
                              )}
                            >
                              <GripVerticalIcon
                                className="size-3.5"
                                aria-hidden
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {canReorder
                              ? "Drag to reorder"
                              : "Reordering needs more than one connection"}
                          </TooltipContent>
                        </Tooltip>

                        <OrderControls
                          index={index}
                          total={rows.length}
                          label={account.label}
                          canReorder={canReorder}
                          onMove={handleMove}
                          buttonClassName="size-6 rounded-sm p-0 [&_svg]:size-3.5"
                        />
                      </div>

                      {/* Identity: label + status. Widest share of the row. */}
                      <div className="flex min-w-0 flex-1 basis-0 flex-col gap-0.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <p
                            className={cn(
                              "min-w-0 truncate text-sm font-medium",
                              !account.enabled && "text-muted-foreground",
                            )}
                            title={account.label}
                          >
                            {account.label}
                          </p>
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5 text-xs">
                          <span
                            className={cn("shrink-0 font-medium", status.text)}
                          >
                            {status.label}
                            {statusKey === "cooldown" ? ` · ${remaining}s` : ""}
                          </span>
                          {account.lastError ? (
                            <span
                              className="min-w-0 truncate text-muted-foreground"
                              title={account.lastError}
                            >
                              — {account.lastError}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/*
                        Quota and last-used as a labelled pair in the middle of
                        the row rather than pinned to the right edge, which left
                        a dead band through the centre of every row.

                        Two equal columns that share the block's width, capped
                        so a very wide viewport feeds the extra space back to
                        the label (which truncates and can carry a long error)
                        instead of stretching two short values across it.
                      */}
                      <dl className="hidden min-w-0 max-w-80 flex-1 basis-0 grid-cols-2 items-center gap-4 border-l border-border/50 pl-4 text-[11px] leading-tight md:grid">
                        <div className="min-w-0">
                          <dt className="uppercase tracking-wide text-muted-foreground/70">
                            Quota
                          </dt>
                          <dd className="truncate font-mono tabular-nums text-foreground/80">
                            {account.quotaLimitTokens
                              ? account.quotaLimitTokens.toLocaleString()
                              : "—"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="uppercase tracking-wide text-muted-foreground/70">
                            Last used
                          </dt>
                          <dd className="truncate text-foreground/80">
                            {account.lastUsedAt
                              ? formatDate(account.lastUsedAt)
                              : "Never"}
                          </dd>
                        </div>
                      </dl>

                      {/*
                        Mobile meta: the same two facts as inline chips, which
                        survive a 360px width where a two-column dl would not.
                      */}
                      <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground md:hidden">
                        <div className="flex items-center gap-1">
                          <dt className="uppercase tracking-wide text-muted-foreground/70">
                            Quota
                          </dt>
                          <dd className="font-mono tabular-nums text-foreground/80">
                            {account.quotaLimitTokens
                              ? account.quotaLimitTokens.toLocaleString()
                              : "—"}
                          </dd>
                        </div>
                        <div className="flex min-w-0 items-center gap-1">
                          <dt className="uppercase tracking-wide text-muted-foreground/70">
                            Used
                          </dt>
                          <dd className="truncate text-foreground/80">
                            {account.lastUsedAt
                              ? formatDate(account.lastUsedAt)
                              : "Never"}
                          </dd>
                        </div>
                      </dl>

                      {/*
                        Control strip. On mobile it spans the row with the
                        ordering arrows on the left and the rest pushed right,
                        so every target is thumb-sized instead of a cramped
                        cluster hanging off the end of a wrapped line.
                      */}
                      <div className="-mb-1 mt-0.5 flex items-center gap-1 border-t border-border/50 pt-2 md:mb-0 md:mt-0 md:shrink-0 md:border-l md:border-t-0 md:pl-3 md:pt-0">
                        <OrderControls
                          index={index}
                          total={rows.length}
                          label={account.label}
                          canReorder={canReorder}
                          onMove={handleMove}
                          className="md:hidden"
                          buttonClassName="size-8 rounded-md p-0"
                        />
                        <div className="ml-auto flex items-center gap-3 md:ml-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {/* Padding, not a bigger switch: keeps the control
                                the same size everywhere while giving a thumb
                                something to land on. */}
                              <span className="flex items-center px-1.5 md:px-0">
                                <Switch
                                  size="sm"
                                  checked={account.enabled}
                                  onCheckedChange={() =>
                                    onToggleAccount(account)
                                  }
                                  disabled={isDeleting}
                                  aria-label={`${
                                    account.enabled ? "Disable" : "Enable"
                                  } ${account.label}`}
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {account.enabled
                                ? "Disable — stops routing through this connection"
                                : "Enable — put this connection back in rotation"}
                            </TooltipContent>
                          </Tooltip>

                          {/*
                            Test and the overflow menu are grouped tighter than
                            they sit from the switch: on/off is a state you
                            flip, Test/menu are the things you click to act on
                            the connection, and a shared gap read them as one
                            run rather than three separately-spaced buttons.
                          */}
                          <div className="flex items-center gap-1">
                            {/*
                              Labelled at every width now that the card spans
                              the page: Test is the action operators reach for
                              most, and its result is usually why they opened
                              this page. A tooltip alone would also be
                              unreachable on touch.
                            */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onTestConnection(account)}
                                  disabled={isTesting || isDeleting}
                                >
                                  {isTesting ? (
                                    <Spinner className="size-4" />
                                  ) : testStatus?.status === "ok" ? (
                                    <CheckCircleIcon className="size-4 text-success" />
                                  ) : testStatus?.status === "error" ? (
                                    <XCircleIcon className="size-4 text-destructive" />
                                  ) : (
                                    <PlugZapIcon className="size-4" />
                                  )}
                                  {isTesting ? "Testing" : "Test"}
                                  <span className="sr-only">
                                    {account.label}
                                  </span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {testStatus?.status === "ok"
                                  ? "Last test succeeded"
                                  : testStatus?.status === "error"
                                    ? (testStatus.message ?? "Last test failed")
                                    : "Send a probe request with this key"}
                              </TooltipContent>
                            </Tooltip>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="md:size-8"
                                  disabled={isDeleting}
                                  aria-label={`Actions for ${account.label}`}
                                >
                                  {isDeleting ? (
                                    <Spinner className="size-4" />
                                  ) : (
                                    <MoreVerticalIcon className="size-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="min-w-44">
                                <DropdownMenuItem
                                  onSelect={() => handleEdit(account)}
                                >
                                  <PencilIcon />
                                  Edit connection
                                </DropdownMenuItem>

                                {/*
                              Only the jump the arrows cannot express in one
                              step. Move up/down used to live here too, but the
                              row now carries both as buttons.
                            */}
                                {accounts.length > 1 ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={isFirst || !canReorder}
                                      onSelect={() => handleMove(index, 0)}
                                    >
                                      <ChevronsUpIcon />
                                      Try first
                                    </DropdownMenuItem>
                                  </>
                                ) : null}

                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={(event) => {
                                    // Keep the menu's focus handling from fighting
                                    // the dialog for focus.
                                    event.preventDefault();
                                    setPendingDelete(account);
                                  }}
                                >
                                  <TrashIcon />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests routed through this key will start failing over to the
              remaining connections. This cannot be undone — to pause it
              temporarily, switch it off instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) onDeleteAccount(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete connection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isDialogOpen ? (
        <AccountFormDialog
          providerId={provider.id}
          account={editingAccount}
          open
          onOpenChange={(open) => {
            if (!open) handleCloseDialog();
          }}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}
