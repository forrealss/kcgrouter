import type { RequestLog } from "@/types/log";

export function LogIdentity({ log }: { log: RequestLog }) {
  return (
    <div className="min-w-0">
      {log.providerName ? (
        <p className="truncate font-medium">{log.providerName}</p>
      ) : null}
      {log.accountLabel ? (
        <p className="truncate text-xs text-muted-foreground">
          {log.accountLabel}
        </p>
      ) : !log.providerName ? (
        <span className="text-muted-foreground">—</span>
      ) : null}
    </div>
  );
}
