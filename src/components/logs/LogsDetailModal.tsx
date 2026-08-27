import { AlertCircleIcon, FileTextIcon, InboxIcon } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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
  if (!payload) return "";
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

/** One label/value row in the metadata grid. */
function MetaRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-xs">{children}</dd>
    </div>
  );
}

function PayloadPane({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const formatted = formatPayload(value);

  if (!formatted) {
    return (
      <div className="mt-3 flex min-h-40 flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed bg-muted/15 text-center">
        <span className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground">
          <InboxIcon className="size-4" />
        </span>
        <p className="text-xs text-muted-foreground">
          No {label.toLowerCase()} was captured for this entry.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <CopyPayloadButton value={formatted} />
      </div>
      <pre className="scrollbar-subtle mt-2 max-h-[45vh] overflow-auto rounded-lg border bg-black/5 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all dark:bg-black/30">
        {formatted}
      </pre>
    </>
  );
}

export function LogsDetailModal({
  selectedLog,
  payloads,
  isPayloadLoading,
  payloadError,
  payloadPending,
  onClose,
}: LogsDetailModalProps) {
  const hasPayload = Boolean(payloads?.requestBody || payloads?.responseBody);
  const isError = selectedLog?.type === "error";

  return (
    <Dialog
      open={selectedLog !== null}
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 gap-1 border-b border-border/60 bg-muted/20 px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            {selectedLog ? typeLabels[selectedLog.type] : "Log"} detail
            {selectedLog ? <LogBadge type={selectedLog.type} /> : null}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {selectedLog ? formatTimestamp(selectedLog.timestamp) : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-subtle flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4">
          {selectedLog ? (
            <>
              {/* Message first: for an error this is the whole point of opening
                  the row, and the table can only ever show it truncated. */}
              {selectedLog.message ? (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2.5",
                    isError
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-border/60 bg-muted/20",
                  )}
                >
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Message
                  </p>
                  <p
                    className={cn(
                      "mt-1 font-mono text-xs leading-relaxed break-words",
                      isError ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {selectedLog.message}
                  </p>
                </div>
              ) : null}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border/60 px-3 py-3 sm:grid-cols-3">
                <MetaRow label="Source">
                  {sourceLabels[selectedLog.source] ?? selectedLog.source}
                </MetaRow>
                <MetaRow label="Provider">
                  <span
                    className="block truncate"
                    title={selectedLog.providerName ?? ""}
                  >
                    {selectedLog.providerName ?? "—"}
                  </span>
                </MetaRow>
                <MetaRow label="Connection">
                  <span
                    className="block truncate"
                    title={selectedLog.accountLabel ?? ""}
                  >
                    {selectedLog.accountLabel ?? "—"}
                  </span>
                </MetaRow>
                <MetaRow label="Model" className="sm:col-span-2">
                  {selectedLog.model ? (
                    <code
                      className="block truncate rounded border border-border/50 bg-muted/60 px-1.5 py-0.5 font-mono"
                      title={selectedLog.model}
                    >
                      {selectedLog.model}
                    </code>
                  ) : (
                    "—"
                  )}
                </MetaRow>
                <MetaRow label="Latency">
                  <span className="font-mono tabular-nums">
                    {selectedLog.latencyMs == null
                      ? "—"
                      : `${selectedLog.latencyMs} ms`}
                  </span>
                </MetaRow>
                <MetaRow label="Retries">
                  <span className="font-mono tabular-nums">
                    {selectedLog.retries ? selectedLog.retries : "none"}
                  </span>
                </MetaRow>
                <MetaRow label="Transport">
                  {selectedLog.stream ? "Streaming" : "Buffered"}
                </MetaRow>
                <MetaRow label="Format">
                  {selectedLog.sourceFormat ?? "—"}
                </MetaRow>
                {selectedLog.requestId ? (
                  <MetaRow label="Request ID" className="sm:col-span-3">
                    <code
                      className="block truncate font-mono text-[11px] text-muted-foreground"
                      title={selectedLog.requestId}
                    >
                      {selectedLog.requestId}
                    </code>
                  </MetaRow>
                ) : null}
              </dl>
            </>
          ) : null}

          {isPayloadLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : payloadError ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Payload could not be loaded</AlertTitle>
              <AlertDescription>{payloadError}</AlertDescription>
            </Alert>
          ) : hasPayload ? (
            <div className="flex min-w-0 flex-col">
              <p className="mb-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Payloads may contain prompts, code, or secrets.
              </p>
              <Tabs defaultValue="request">
                <TabsList className="w-full sm:w-fit">
                  <TabsTrigger value="request" className="flex-1 sm:flex-none">
                    Request
                  </TabsTrigger>
                  <TabsTrigger value="response" className="flex-1 sm:flex-none">
                    Response
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="request">
                  <PayloadPane label="Request" value={payloads?.requestBody} />
                </TabsContent>
                <TabsContent value="response">
                  <PayloadPane
                    label="Response"
                    value={payloads?.responseBody}
                  />
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5 rounded-lg border border-dashed bg-muted/15 px-4 py-8 text-center">
              <span className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground">
                <FileTextIcon className="size-4" />
              </span>
              <p className="text-sm font-medium">No payload stored</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {selectedLog?.type === "admin"
                  ? "Admin actions record what changed, not a request body."
                  : payloadPending
                    ? "This request has not finished yet — the payload appears once it completes."
                    : "Nothing was captured for this entry. Logs created before payload capture have none."}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
