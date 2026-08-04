import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProviderUsage, UsageSummary } from "@/types/usage";

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

interface UsageSummaryCardsProps {
  summary: UsageSummary;
}

export function UsageSummaryCards({ summary }: UsageSummaryCardsProps) {
  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;

  return (
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
  );
}

interface UsageProviderCardsProps {
  providers: ProviderUsage[];
  accountLabels: Map<string, string>;
}

export function UsageProviderCards({
  providers,
  accountLabels,
}: UsageProviderCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {providers.map((provider) => {
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
                <span className="text-muted-foreground">Input</span>
                <span className="font-medium">
                  {formatTokens(provider.inputTokens)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Output</span>
                <span className="font-medium">
                  {formatTokens(provider.outputTokens)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Estimated cost</span>
                <span className="font-medium">{formatCost(provider.cost)}</span>
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
  );
}
