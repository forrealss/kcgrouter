"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { QuotaAccount } from "@/types/quota";

interface QuotaCardProps {
  account: QuotaAccount;
}

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const resetTypeLabels: Record<QuotaAccount["quotaResetType"], string> = {
  "5h": "5h",
  daily: "daily",
  weekly: "weekly",
  none: "none",
};

const statusLabels: Record<QuotaAccount["status"], string> = {
  active: "Active",
  error: "Error",
  expired: "Expired",
};

function getStatusBadgeVariant(
  status: QuotaAccount["status"],
): "default" | "secondary" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "error":
      return "destructive";
    case "expired":
      return "secondary";
  }
}

function formatTokens(tokens: number): string {
  return numberFormatter.format(tokens);
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "Never used";

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : dateFormatter.format(date);
}

function getProgressValue(
  tokensUsed: number,
  quotaLimitTokens: number,
): number {
  if (quotaLimitTokens <= 0) return tokensUsed > 0 ? 100 : 0;

  return Math.min(100, Math.max(0, (tokensUsed / quotaLimitTokens) * 100));
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "Resetting soon";

  const totalSeconds = Math.ceil(remainingMs / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function ResetCountdown({ windowEnd }: { windowEnd: string | null }) {
  const resetAt = useMemo(() => {
    if (!windowEnd) return null;

    const timestamp = new Date(windowEnd).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }, [windowEnd]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (resetAt === null) return;

    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(intervalId);
  }, [resetAt]);

  if (!windowEnd) return "No scheduled reset";
  if (resetAt === null) return "Reset schedule unavailable";

  return `Resets in ${formatCountdown(resetAt - now)}`;
}

export function QuotaCard({ account }: QuotaCardProps) {
  const { quotaState } = account;
  const quotaLimitTokens = account.quotaLimitTokens;
  const progressValue =
    quotaLimitTokens === null
      ? null
      : getProgressValue(quotaState.tokensUsed, quotaLimitTokens);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{account.label}</CardTitle>
        <CardDescription className="truncate">
          {account.providerName}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          {!account.available ? (
            <Badge variant="outline">Unavailable</Badge>
          ) : null}
          <Badge variant={getStatusBadgeVariant(account.status)}>
            {statusLabels[account.status]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Token quota</span>
            {quotaLimitTokens === null ? (
              <Badge variant="secondary">Unlimited</Badge>
            ) : (
              <span className="font-medium">
                {Math.round(progressValue ?? 0)}%
              </span>
            )}
          </div>
          {quotaLimitTokens === null ? (
            <p className="text-sm text-muted-foreground">
              {formatTokens(quotaState.tokensUsed)} tokens used
            </p>
          ) : (
            <>
              <Progress
                value={progressValue ?? 0}
                aria-label={`${formatTokens(quotaState.tokensUsed)} of ${formatTokens(quotaLimitTokens)} tokens used`}
              />
              <p className="text-sm text-muted-foreground">
                {formatTokens(quotaState.tokensUsed)} of{" "}
                {formatTokens(quotaLimitTokens)} tokens used
              </p>
            </>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Requests</dt>
            <dd className="font-medium">
              {formatTokens(quotaState.requestCount)}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Last used</dt>
            <dd className="font-medium">
              {formatTimestamp(account.lastUsedAt)}
            </dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">
          {resetTypeLabels[account.quotaResetType]}
        </Badge>
        <span aria-live="polite">
          <ResetCountdown windowEnd={quotaState.windowEnd} />
        </span>
      </CardFooter>
    </Card>
  );
}
