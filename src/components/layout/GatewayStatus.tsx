import { useSseStatus } from "@/lib/sse-bus";
import { cn } from "@/lib/utils";

export const gatewayStatusMeta = {
  live: {
    label: "gateway online",
    dot: "bg-live dark:shadow-[0_0_6px] dark:shadow-live/70",
  },
  connecting: {
    label: "connecting",
    dot: "bg-warning motion-safe:animate-pulse",
  },
  offline: {
    label: "gateway offline",
    dot: "bg-destructive dark:shadow-[0_0_6px] dark:shadow-destructive/70",
  },
} as const;

/** Live state of the shared `/api/events` stream, rendered as a dot + label. */
export function GatewayStatus({ className }: { className?: string }) {
  const { label, dot } = gatewayStatusMeta[useSseStatus()];

  return (
    <span
      aria-live="polite"
      title={label}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot)} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
