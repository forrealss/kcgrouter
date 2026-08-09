import { ActivityIcon, CircleCheckIcon, CircleXIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RequestLogType } from "@/types/log";

const typeLabels: Record<RequestLogType, string> = {
  request: "Request",
  success: "Success",
  error: "Error",
  admin: "Admin",
};

function typeBadgeClass(type: RequestLogType): string {
  switch (type) {
    case "success":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "error":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    case "admin":
      return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

function TypeIcon({ type }: { type: RequestLogType }) {
  if (type === "success") return <CircleCheckIcon className="size-3" />;
  if (type === "error") return <CircleXIcon className="size-3" />;
  return <ActivityIcon className="size-3" />;
}

export { typeBadgeClass, typeLabels };

export function LogBadge({ type }: { type: RequestLogType }) {
  return (
    <Badge variant="outline" className={`gap-1 ${typeBadgeClass(type)}`}>
      <TypeIcon type={type} />
      {typeLabels[type]}
    </Badge>
  );
}
