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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Connections</CardTitle>
            <CardDescription>
              Manage API keys and credentials for {provider.name}.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={handleAdd}>
            <PlusIcon data-icon="inline-start" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <KeyRoundIcon className="size-8 opacity-50" />
              <p>No connections yet.</p>
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
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "size-2 rounded-full",
                          account.status === "active"
                            ? "bg-green-500"
                            : account.status === "error"
                              ? "bg-red-500"
                              : "bg-yellow-500",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{account.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {account.quotaLimitTokens
                            ? `Quota limit: ${account.quotaLimitTokens.toLocaleString()} tokens`
                            : "No quota limit"}
                        </p>
                        {account.lastError ? (
                          <p
                            className="mt-1 max-w-80 truncate text-xs font-medium text-red-600 dark:text-red-400"
                            title={account.lastError}
                          >
                            ⚠ {account.lastError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
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
                          <CheckCircleIcon className="size-4 text-green-500" />
                        ) : testStatus?.status === "error" ? (
                          <XCircleIcon className="size-4 text-red-500" />
                        ) : (
                          <FlaskConicalIcon className="size-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleEdit(account)}
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
                            className="text-muted-foreground hover:text-destructive"
                            disabled={isDeleting}
                          >
                            {isDeleting ? (
                              <Spinner className="size-4" />
                            ) : (
                              <TrashIcon className="size-4" />
                            )}
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
