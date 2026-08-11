import { Skeleton } from "@/components/ui/skeleton";

const skeletonColumns = [
  "time",
  "type",
  "source",
  "identity",
  "model",
  "message",
  "latency",
];
const skeletonRows = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];

export function LogsSkeleton() {
  return (
    <div
      className="min-h-0 flex-1 overflow-hidden"
      role="status"
      aria-label="Loading logs"
    >
      <div className="hidden gap-4 border-b bg-muted/20 px-4 py-2.5 font-mono md:grid md:grid-cols-[1.25fr_0.7fr_0.7fr_1.4fr_1.2fr_1.8fr_0.65fr]">
        {skeletonColumns.map((column) => (
          <Skeleton key={column} className="h-2.5 w-16" />
        ))}
      </div>
      <div className="divide-y border-b">
        {skeletonRows.map((row) => (
          <div
            key={row}
            className="grid gap-3 px-4 py-3 md:grid-cols-[1.25fr_0.7fr_0.7fr_1.4fr_1.2fr_1.8fr_0.65fr] md:items-center"
          >
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="ml-auto h-3.5 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
