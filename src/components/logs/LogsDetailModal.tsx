import { AlertCircleIcon, Clock3Icon } from "lucide-react";
import { CopyPayloadButton } from "@/components/logs/CopyPayloadButton";
import { LogBadge, typeLabels } from "@/components/logs/LogBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PayloadData, RequestLog } from "@/types/log";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : timestampFormatter.format(date);
}

function formatPayload(payload: string | null | undefined): string {
  if (!payload) return "Payload is not available for this entry.";
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

const sourceLabels: Record<string, string> = {
  router: "Router",
  test: "Test",
  admin: "Admin",
};

interface LogsDetailModalProps {
  selectedLog: RequestLog | null;
  payloads: PayloadData | null;
  isPayloadLoading: boolean;
  payloadError: string | null;
  payloadPending: boolean;
  onClose: (open: boolean) => void;
}

export function LogsDetailModal({
  selectedLog,
  payloads,
  isPayloadLoading,
  payloadError,
  payloadPending,
  onClose,
}: LogsDetailModalProps) {
  return (
    <Dialog
      open={selectedLog !== null}
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedLog ? typeLabels[selectedLog.type] : "Log"} detail
            {selectedLog ? <LogBadge type={selectedLog.type} /> : null}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span>
              {selectedLog ? formatTimestamp(selectedLog.timestamp) : ""}
            </span>
            <span aria-hidden>·</span>
            <span>{selectedLog ? sourceLabels[selectedLog.source] : ""}</span>
            {selectedLog?.model ? (
              <>
                <span aria-hidden>·</span>
                <code>{selectedLog.model}</code>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Payloads may contain prompts, code, or sensitive data. Only view them
          from a trusted dashboard.
        </p>

        {isPayloadLoading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading payload...
          </div>
        ) : payloadError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Payload details could not be loaded</AlertTitle>
            <AlertDescription>{payloadError}</AlertDescription>
          </Alert>
        ) : (
          <>
            {payloadPending ? (
              <Alert>
                <Clock3Icon />
                <AlertTitle>Payload not available yet</AlertTitle>
                <AlertDescription>
                  This request log was just created. The payload will be
                  available after processing finishes. Older logs may not have
                  payloads because they were created before this feature was
                  enabled.
                </AlertDescription>
              </Alert>
            ) : null}
            <Tabs defaultValue="request" className="min-h-0 flex-1">
              <TabsList className="w-full sm:w-fit">
                <TabsTrigger value="request" className="flex-1 sm:flex-none">
                  Request payload
                </TabsTrigger>
                <TabsTrigger value="response" className="flex-1 sm:flex-none">
                  Response
                </TabsTrigger>
              </TabsList>
              <TabsContent value="request" className="mt-3 min-h-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Payload received by the router
                  </span>
                  <CopyPayloadButton
                    value={formatPayload(payloads?.requestBody)}
                  />
                </div>
                <pre className="mt-2 max-h-[55vh] overflow-auto rounded-lg border bg-muted/35 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                  {formatPayload(payloads?.requestBody)}
                </pre>
              </TabsContent>
              <TabsContent value="response" className="mt-3 min-h-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Returned response
                  </span>
                  <CopyPayloadButton
                    value={formatPayload(payloads?.responseBody)}
                  />
                </div>
                <pre className="mt-2 max-h-[55vh] overflow-auto rounded-lg border bg-muted/35 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                  {formatPayload(payloads?.responseBody)}
                </pre>
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
