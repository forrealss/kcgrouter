import { BarChart3Icon } from "lucide-react";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UsageProviderCards,
  UsageSummaryCards,
} from "@/components/usage/UsageSummaryCards";
import { UsageTable } from "@/components/usage/UsageTable";
import { useUsage } from "@/hooks/useUsage";

export function UsagePage() {
  const {
    summary,
    summaryError,
    isSummaryLoading,
    accounts,
    accountsError,
    isAccountsLoading,
    accountLabels,
    loadSummary,
    loadAccounts,
  } = useUsage();

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
            <BarChart3Icon />
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
            <UsageSummaryCards summary={summary} />

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
                  <UsageProviderCards
                    providers={summary.byProvider}
                    accountLabels={accountLabels}
                  />
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
