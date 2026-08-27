import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { UsageRecord } from "@/types/usage";

interface UsageDetailModalProps {
  record: UsageRecord | null;
  open: boolean;
  /** True while the payload endpoint round-trip is in flight. */
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  accountLabel?: string;
}

function tryFormatJson(raw: string | null | undefined): string {
  if (!raw) return "N/A";
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={() => void handleCopy()}
      aria-label="Copy payload"
      title="Copy payload"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-success" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </Button>
  );
}

export function UsageDetailModal({
  record,
  open,
  loading = false,
  onOpenChange,
  accountLabel,
}: UsageDetailModalProps) {
  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(80svh,52rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Request Detail</span>
            <Badge
              variant={
                record.status === "success" ? "secondary" : "destructive"
              }
            >
              {record.status === "success" ? 200 : 500}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 break-all text-xs">
            <span className="font-mono">POST</span>
            <span>/v1/chat/completions</span>
            <span className="text-muted-foreground">·</span>
            <span>{accountLabel ?? record.providerAccountId}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 scrollbar-subtle">
          {/* Response Payload */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Response Payload
              </span>
              <CopyButton text={tryFormatJson(record.responseBody)} />
            </div>
            {loading ? (
              <PayloadSkeleton />
            ) : (
              <pre className="rounded-md bg-muted p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                {tryFormatJson(record.responseBody)}
              </pre>
            )}
          </div>

          {/* Request Payload */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Request Payload
              </span>
              <CopyButton text={tryFormatJson(record.requestBody)} />
            </div>
            {loading ? (
              <PayloadSkeleton />
            ) : (
              <pre className="rounded-md bg-muted p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                {tryFormatJson(record.requestBody)}
              </pre>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayloadSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted p-4">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
