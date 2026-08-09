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
    <div className="flex min-w-0 items-center gap-2 border-b p-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-3 sm:py-2.5">
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tone}`}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[9px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[10px]">
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums tracking-tight sm:text-base">
          {value}
        </p>
      </div>
    </div>
  );
}
