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
      return "border-success/20 bg-success/10 text-success";
    case "error":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    case "admin":
      return "border-warning/25 bg-warning/10 text-warning";
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
