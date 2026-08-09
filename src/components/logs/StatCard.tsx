import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-lg font-semibold tabular-nums tracking-tight">
          {value}
        </p>
      </div>
    </div>
  );
}
