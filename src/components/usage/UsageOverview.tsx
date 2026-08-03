"use client";

import { AlertCircleIcon, BarChart3Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { type UsageAccountOption, UsageTable } from "./UsageTable";

interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byProvider: ProviderUsage[];
}

interface ProviderUsage {
  providerAccountId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  requestCount: number;
}

interface Provider {
  id: string;
  name: string;
}

interface ProviderAccount {
  id: string;
  label: string;
}

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

function formatTokens(tokens: number): string {
  return numberFormatter.format(tokens);
}

function formatCost(cost: number): string {
  return currencyFormatter.format(cost);
}

interface SummaryMetricCardProps {
  title: string;
  description: string;
  value: string;
}

function SummaryMetricCard({
  title,
  description,
  value,
}: SummaryMetricCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Last 30 days
      </CardFooter>
    </Card>
  );
}

export function UsageOverview() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [accounts, setAccounts] = useState<UsageAccountOption[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    setSummaryError(null);

    try {
      const response = await apiClient.get<UsageSummary>("/api/usage/summary");
      setSummary(response);
    } catch (requestError) {
      setSummaryError(getApiErrorMessage(requestError));
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setIsAccountsLoading(true);
    setAccountsError(null);

    try {
      const providers = await apiClient.get<Provider[]>("/api/providers");
      const accountGroups = await Promise.all(
        providers.map(async (provider) => {
          const providerAccounts = await apiClient.get<ProviderAccount[]>(
            `/api/providers/${encodeURIComponent(provider.id)}/accounts`,
          );

          return providerAccounts.map((account) => ({
            id: account.id,
            label: `${provider.name} — ${account.label}`,
          }));
        }),
      );

      setAccounts(accountGroups.flat());
    } catch (requestError) {
      setAccountsError(getApiErrorMessage(requestError));
    } finally {
      setIsAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadAccounts();
  }, [loadAccounts, loadSummary]);

  const accountLabels = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.label])),
    [accounts],
  );
  const totalTokens = summary
    ? summary.totalInputTokens + summary.totalOutputTokens
    : 0;

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="flex flex-col gap-6">
        {isSummaryLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Usage overview</CardTitle>
              <CardDescription>
                Aggregating usage from the last 30 days.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Loading usage summary…
            </CardContent>
            <CardFooter className="text-sm text-muted-foreground">
              Last 30 days
            </CardFooter>
          </Card>
        ) : null}

        {!isSummaryLoading && summaryError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Usage summary could not be loaded</AlertTitle>
            <AlertDescription className="gap-3">
              <p>{summaryError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadSummary()}
              >
                Retry summary
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {!isSummaryLoading && !summaryError && summary ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryMetricCard
                title="Input tokens"
                description="Tokens sent to provider models"
                value={formatTokens(summary.totalInputTokens)}
              />
              <SummaryMetricCard
                title="Output tokens"
                description="Tokens returned by provider models"
                value={formatTokens(summary.totalOutputTokens)}
              />
              <SummaryMetricCard
                title="Total tokens"
                description="Combined input and output tokens"
                value={formatTokens(totalTokens)}
              />
              <SummaryMetricCard
                title="Estimated cost"
                description="Calculated from recorded request usage"
                value={formatCost(summary.totalCost)}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Usage by provider account</CardTitle>
                <CardDescription>
                  Total tokens, estimated cost, and requests for the current
                  30-day period.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary.byProvider.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BarChart3Icon />
                      </EmptyMedia>
                      <EmptyTitle>No usage yet</EmptyTitle>
                      <EmptyDescription>
                        Usage will appear after requests are routed through a
                        provider account.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {summary.byProvider.map((provider) => {
                      const totalProviderTokens =
                        provider.inputTokens + provider.outputTokens;

                      return (
                        <Card key={provider.providerAccountId}>
                          <CardHeader>
                            <CardTitle className="truncate">
                              {accountLabels.get(provider.providerAccountId) ??
                                provider.providerAccountId}
                            </CardTitle>
                            <CardDescription>
                              {formatTokens(totalProviderTokens)} total tokens
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-2 text-sm">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">
                                Input
                              </span>
                              <span className="font-medium">
                                {formatTokens(provider.inputTokens)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">
                                Output
                              </span>
                              <span className="font-medium">
                                {formatTokens(provider.outputTokens)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">
                                Estimated cost
                              </span>
                              <span className="font-medium">
                                {formatCost(provider.cost)}
                              </span>
                            </div>
                          </CardContent>
                          <CardFooter className="justify-between text-sm text-muted-foreground">
                            <span>Requests</span>
                            <Badge variant="secondary">
                              {formatTokens(provider.requestCount)}
                            </Badge>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              <CardFooter className="text-sm text-muted-foreground">
                Summary defaults to the last 30 days on the server.
              </CardFooter>
            </Card>
          </>
        ) : null}
      </TabsContent>

      <TabsContent value="history">
        <UsageTable
          accounts={accounts}
          accountsLoading={isAccountsLoading}
          accountsError={accountsError}
          onRetryAccounts={() => void loadAccounts()}
        />
      </TabsContent>
    </Tabs>
  );
}
