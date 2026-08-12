import type { RequestLog } from "@/types/log";

export function LogMessage({ log }: { log: RequestLog }) {
  const retried = (log.retries ?? 0) > 0;
  return (
    <span className="flex items-center gap-1.5">
      {log.message ? (
        <span
          className="block line-clamp-2 text-xs leading-relaxed"
          title={log.message}
        >
          {log.message}
        </span>
      ) : (
        <span className="text-muted-foreground">No message</span>
      )}
      {retried ? (
        <span
          className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1 py-px font-mono text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300"
          title={`Retried ${log.retries}× before this entry`}
        >
          retried {log.retries}×
        </span>
      ) : null}
    </span>
  );
}
