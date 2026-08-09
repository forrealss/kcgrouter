import type { RequestLog } from "@/types/log";

export function LogMessage({ log }: { log: RequestLog }) {
  return log.message ? (
    <span
      className="block line-clamp-2 text-sm leading-relaxed"
      title={log.message}
    >
      {log.message}
    </span>
  ) : (
    <span className="text-muted-foreground">No message</span>
  );
}
