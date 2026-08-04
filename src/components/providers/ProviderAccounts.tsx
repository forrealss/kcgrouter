import {
  AlertCircleIcon,
  ClockIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { AccountsState } from "@/hooks/useProviders";
import { cn } from "@/lib/utils";
import type { Provider, ProviderAccount } from "@/types/provider";

const statusMeta: Record<
  ProviderAccount["status"],
  { label: string; dotClassName: string }
> = {
  active: { label: "Aktif", dotClassName: "bg-emerald-500" },
  error: { label: "Error", dotClassName: "bg-destructive" },
  expired: { label: "Kedaluwarsa", dotClassName: "bg-muted-foreground/60" },
};

const quotaResetLabels: Record<ProviderAccount["quotaResetType"], string> = {
  "5h": "Reset 5 jam",
  daily: "Reset harian",
  weekly: "Reset mingguan",
  none: "Tanpa reset",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak diketahui";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatQuotaLimit(tokens: number | null): string {
  if (tokens === null) return "Tidak dibatasi";
  return `${new Intl.NumberFormat("id-ID").format(tokens)} token`;
}

function AccountSkeletonRows() {
  return (
    <div className="flex flex-col gap-3">
      <span className="sr-only" role="status">
        Memuat akun...
      </span>
      <div aria-hidden className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-3.5 w-36" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProviderAccountsProps {
  provider: Provider;
  state?: AccountsState;
  deletingAccountId: string | null;
  onAddAccount: (providerId: string) => void;
  onEditAccount: (providerId: string, account: ProviderAccount) => void;
  onDeleteAccount: (account: ProviderAccount) => Promise<void>;
  onRetry: (providerId: string) => Promise<void>;
}

export function ProviderAccounts({
  provider,
  state,
  deletingAccountId,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onRetry,
}: ProviderAccountsProps) {
  if (state?.isLoading || !state) {
    return <AccountSkeletonRows />;
  }

  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Akun tidak dapat dimuat</AlertTitle>
        <AlertDescription className="gap-3">
          <p>{state.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRetry(provider.id)}
          >
            <RefreshCwIcon data-icon="inline-start" />
            Coba lagi
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!state.accounts?.length) {
    return (
      <Empty className="border p-6 md:p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRoundIcon />
          </EmptyMedia>
          <EmptyTitle>Belum ada akun</EmptyTitle>
          <EmptyDescription>
            Tambahkan kredensial untuk mulai menggunakan provider ini.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            type="button"
            size="sm"
            onClick={() => onAddAccount(provider.id)}
          >
            <PlusIcon data-icon="inline-start" />
            Tambah akun
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label={`Akun ${provider.name}`}>
      {state.accounts.map((account) => {
        const isDeleting = deletingAccountId === account.id;
        const status = statusMeta[account.status];

        return (
          <li
            key={account.id}
            className="flex flex-col gap-3 rounded-lg border p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium">
                {account.label}
              </p>
              <Badge variant="outline" className="shrink-0 gap-1.5 font-normal">
                <span
                  className={cn("size-1.5 rounded-full", status.dotClassName)}
                  aria-hidden
                />
                {status.label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 font-normal text-muted-foreground"
              >
                <ClockIcon className="size-3" />
                {quotaResetLabels[account.quotaResetType]}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {formatQuotaLimit(account.quotaLimitTokens)}
              </span>
            </div>
            <dl className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-x-1">
                <dt>Terakhir digunakan:</dt>
                <dd>
                  {account.lastUsedAt
                    ? formatDate(account.lastUsedAt)
                    : "Belum pernah"}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-1">
                <dt>Dibuat:</dt>
                <dd>{formatDate(account.createdAt)}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEditAccount(provider.id, account)}
                disabled={isDeleting}
              >
                <PencilIcon data-icon="inline-start" />
                Ubah
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Trash2Icon data-icon="inline-start" />
                    )}
                    Hapus
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Hapus akun {account.label}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Kredensial akun ini akan dihapus dan tidak dapat
                      dipulihkan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      Batal
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={isDeleting}
                      onClick={() => void onDeleteAccount(account)}
                    >
                      {isDeleting ? <Spinner data-icon="inline-start" /> : null}
                      Hapus akun
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
