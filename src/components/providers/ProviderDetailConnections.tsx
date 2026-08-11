import {
  CheckCircleIcon,
  FlaskConicalIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { TestStatusValue } from "@/hooks/useProviderDetail";
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

const statusMeta = {
  active: {
    label: "ACTIVE",
    dot: "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    label: "ERROR",
    dot: "bg-destructive shadow-[0_0_6px] shadow-destructive/70",
    text: "text-destructive",
  },
  expired: {
    label: "EXPIRED",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
} as const;

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

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/15 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  accounts.some((account) => account.status === "error")
                    ? "bg-destructive shadow-[0_0_6px] shadow-destructive/70"
                    : accounts.some((account) => account.status === "active")
                      ? "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70"
                      : "bg-muted-foreground/50",
                )}
              />
              <CardTitle className="text-base">Connections</CardTitle>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {accounts.length.toString().padStart(2, "0")}
              </span>
            </div>
            <CardDescription className="mt-1">
              API keys and credentials for {provider.name}.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={handleAdd}>
            <PlusIcon data-icon="inline-start" />
            Add connection
          </Button>
        </CardHeader>
        <CardContent className="p-4 md:p-5">
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/15 px-4 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                <KeyRoundIcon className="size-5" />
              </span>
              <div>
                <p className="font-mono text-sm text-foreground">
                  NO CONNECTIONS CONFIGURED
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add credentials to make this upstream available to the router.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAdd}
              >
                <PlusIcon data-icon="inline-start" />
                Add connection
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {accounts.map((account) => {
                const isDeleting = deletingAccountId === account.id;
                const isTesting = testingAccountId === account.id;
                const testStatus = accountTestStatus[account.id];
                const status = statusMeta[account.status];
                return (
                  <div
                    key={account.id}
                    className="group flex flex-col gap-3 rounded-lg border bg-muted/15 p-3 transition-colors hover:border-primary/30 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          status.dot,
                        )}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {account.label}
                          </p>
                          <span
                            className={cn(
                              "font-mono text-[10px] tracking-wide",
                              status.text,
                            )}
                          >
                            {status.label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                          <span>
                            {account.quotaLimitTokens
                              ? `QUOTA ${account.quotaLimitTokens.toLocaleString()} TOKENS`
                              : "QUOTA UNLIMITED"}
                          </span>
                          <span className="text-muted-foreground/60">
                            {account.lastUsedAt
                              ? `LAST USED ${new Date(account.lastUsedAt).toLocaleDateString()}`
                              : "NOT USED YET"}
                          </span>
                        </div>
                        {account.lastError ? (
                          <p
                            className="mt-1 max-w-full truncate text-xs font-medium text-destructive sm:max-w-[32rem]"
                            title={account.lastError}
                          >
                            {account.lastError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onTestConnection(account)}
                        disabled={isTesting || isDeleting}
                        title={
                          testStatus?.status === "ok"
                            ? "OK"
                            : testStatus?.status === "error"
                              ? (testStatus.message ?? "Error")
                              : "Test connection"
                        }
                      >
                        {isTesting ? (
                          <Spinner className="size-4" />
                        ) : testStatus?.status === "ok" ? (
                          <CheckCircleIcon className="size-4 text-emerald-500" />
                        ) : testStatus?.status === "error" ? (
                          <XCircleIcon className="size-4 text-destructive" />
                        ) : (
                          <FlaskConicalIcon className="size-4" />
                        )}
                        <span className="sr-only">Test connection</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleEdit(account)}
                        title="Edit connection"
                      >
                        <span className="sr-only">Edit</span>
                        <PencilIcon className="size-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            disabled={isDeleting}
                            title="Delete connection"
                          >
                            {isDeleting ? (
                              <Spinner className="size-4" />
                            ) : (
                              <TrashIcon className="size-4" />
                            )}
                            <span className="sr-only">Delete connection</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete {account.label}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This connection will be permanently deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => onDeleteAccount(account)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
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
