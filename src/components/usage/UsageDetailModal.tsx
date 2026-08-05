"use client";

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
import type { UsageRecord } from "@/types/usage";

interface UsageDetailModalProps {
  record: UsageRecord | null;
  open: boolean;
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
      title="Copy"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-green-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </Button>
  );
}

export function UsageDetailModal({
  record,
  open,
  onOpenChange,
  accountLabel,
}: UsageDetailModalProps) {
  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
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
          <DialogDescription className="flex items-center gap-2 text-xs">
            <span className="font-mono">POST</span>
            <span>/v1/chat/completions</span>
            <span className="text-muted-foreground">·</span>
            <span>{accountLabel ?? record.providerAccountId}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto flex flex-col gap-4">
          {/* Response Payload */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Response Payload
              </span>
              <CopyButton text={tryFormatJson(record.responseBody)} />
            </div>
            <pre className="rounded-md bg-muted p-4 text-xs overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
              {tryFormatJson(record.responseBody)}
            </pre>
          </div>

          {/* Request Payload */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Request Payload
              </span>
              <CopyButton text={tryFormatJson(record.requestBody)} />
            </div>
            <pre className="rounded-md bg-muted p-4 text-xs overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
              {tryFormatJson(record.requestBody)}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
