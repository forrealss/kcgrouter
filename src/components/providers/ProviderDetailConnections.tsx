import {
  CheckCircleIcon,
  KeyRoundIcon,
  PencilIcon,
  PlugZapIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
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
  AlertDialogTrigger,
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
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
  onDeleteAccount: (account: ProviderAccount) => void;
  onAccountSaved: () => void;
  onTestConnection: (account: ProviderAccount) => void;
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

function formatQuota(account: ProviderAccount): string {
  return account.quotaLimitTokens
    ? `${account.quotaLimitTokens.toLocaleString()} token cap`
    : "No token cap";
}

function formatLastUsed(account: ProviderAccount): string {
  if (!account.lastUsedAt) return "Never used";
  return `Last used ${formatDate(account.lastUsedAt)}`;
}

export function ProviderDetailConnections({
  provider,
  accounts,
  deletingAccountId,
  testingAccountId,
  accountTestStatus,
  onDeleteAccount,
  onAccountSaved,
  onTestConnection,
}: ProviderDetailConnectionsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ProviderAccount | null>(
    null,
  );
  useCooldownTick(accounts);

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

  const activeCount = accounts.filter((a) => a.status === "active").length;

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
              : `${activeCount} of ${accounts.length} ready to serve traffic.`}
          </CardDescription>
          <CardAction>
            <Button type="button" size="sm" onClick={handleAdd}>
              <PlusIcon data-icon="inline-start" />
              Add connection
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="px-5 py-4">
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
              <ul className="flex flex-col gap-2">
                {accounts.map((account) => {
                  const isDeleting = deletingAccountId === account.id;
                  const isTesting = testingAccountId === account.id;
                  const testStatus = accountTestStatus[account.id];
                  const statusKey = resolveAccountStatus(account);
                  const status = accountStatusMeta[statusKey];
                  const remaining = cooldownRemainingSeconds(
                    account.cooldownUntil,
                  );

                  return (
                    <li
                      key={account.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/10 p-3 transition-colors",
                        "hover:border-border hover:bg-muted/25",
                        "sm:flex-row sm:items-center sm:justify-between",
                        statusKey === "error" &&
                          "border-destructive/30 bg-destructive/5",
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            status.dot,
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="truncate text-sm font-medium">
                              {account.label}
                            </p>
                            <span
                              className={cn("text-xs font-medium", status.text)}
                            >
                              {status.label}
                              {statusKey === "cooldown"
                                ? ` · retries in ${remaining}s`
                                : ""}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatQuota(account)}
                            <span aria-hidden> · </span>
                            {formatLastUsed(account)}
                          </p>
                          {account.lastError ? (
                            <p
                              className="mt-1 line-clamp-2 text-xs text-destructive"
                              title={account.lastError}
                            >
                              {account.lastError}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
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
                                <Spinner data-icon="inline-start" />
                              ) : testStatus?.status === "ok" ? (
                                <CheckCircleIcon
                                  data-icon="inline-start"
                                  className="text-emerald-500"
                                />
                              ) : testStatus?.status === "error" ? (
                                <XCircleIcon
                                  data-icon="inline-start"
                                  className="text-destructive"
                                />
                              ) : (
                                <PlugZapIcon data-icon="inline-start" />
                              )}
                              {isTesting ? "Testing" : "Test"}
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

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleEdit(account)}
                            >
                              <PencilIcon className="size-4" />
                              <span className="sr-only">
                                Edit {account.label}
                              </span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit connection</TooltipContent>
                        </Tooltip>

                        <AlertDialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  disabled={isDeleting}
                                >
                                  {isDeleting ? (
                                    <Spinner className="size-4" />
                                  ) : (
                                    <TrashIcon className="size-4" />
                                  )}
                                  <span className="sr-only">
                                    Delete {account.label}
                                  </span>
                                </Button>
                              </AlertDialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Delete connection</TooltipContent>
                          </Tooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete {account.label}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Requests routed through this key will start
                                failing over to the remaining connections. This
                                cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep it</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => onDeleteAccount(account)}
                              >
                                Delete connection
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

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
