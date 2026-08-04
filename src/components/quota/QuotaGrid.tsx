"use client";

import { AlertCircleIcon, GaugeIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { type QuotaAccount, QuotaCard } from "./QuotaCard";

export function QuotaGrid() {
  const [accounts, setAccounts] = useState<QuotaAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestIdRef = useRef(0);

  const loadQuota = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<QuotaAccount[]>("/api/quota");
      if (requestId === requestIdRef.current) setAccounts(response);
    } catch (requestError) {
      if (requestId === requestIdRef.current) {
        setError(getApiErrorMessage(requestError));
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuota();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadQuota]);

  const isInitialLoading = isLoading && accounts === null;
  const showEmptyState = !isLoading && !error && accounts?.length === 0;
  const showGrid = accounts !== null && accounts.length > 0;

  return (
    <section className="flex flex-col gap-6" aria-labelledby="quota-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2
            id="quota-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            Quota
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitor token usage and reset windows for each provider account.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadQuota()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          Refresh
        </Button>
      </div>

      {isInitialLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Loading quota</CardTitle>
            <CardDescription>
              Retrieving the latest quota state for your provider accounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading quota…
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground">
            This may take a moment.
          </CardFooter>
        </Card>
      ) : null}

      {!isInitialLoading && error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Quota could not be loaded</AlertTitle>
          <AlertDescription className="gap-3">
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadQuota()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {showEmptyState ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GaugeIcon />
            </EmptyMedia>
            <EmptyTitle>No quota accounts yet</EmptyTitle>
            <EmptyDescription>
              Quota details will appear after provider accounts are configured.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadQuota()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Refresh quota
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {showGrid ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <QuotaCard key={account.id} account={account} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default QuotaGrid;
