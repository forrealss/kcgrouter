import { ArrowUpRightIcon, Layers3Icon } from "lucide-react";
import { Truncated } from "@/components/dashboard/Truncated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/hooks/useRouter";
import { cn } from "@/lib/utils";
import type { Combo, ComboMember } from "@/types/combo";
import type { ProviderAccount } from "@/types/provider";

interface CombosTopologyCardProps {
  combos: Combo[];
  membersByCombo: Record<string, ComboMember[]>;
  accountById: (id: string) => ProviderAccount | undefined;
  isLoading: boolean;
  error: string | null;
}

/**
 * Routing topology: which combos exist, their strategy, and the ordered
 * chain of accounts/models backing them, with a status dot per member so a
 * combo that routes through a dead account is visible at a glance.
 */
export function CombosTopologyCard({
  combos,
  membersByCombo,
  accountById,
  isLoading,
  error,
}: CombosTopologyCardProps) {
  const { navigate } = useRouter();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="flex min-w-0 items-center gap-2 font-semibold">
          <Layers3Icon className="size-4 shrink-0 text-muted-foreground" />
          Combos
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => navigate("/combos")}
        >
          Manage <ArrowUpRightIcon className="size-3.5" />
        </Button>
      </div>

      {error ? (
        <p className="mx-5 mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Combos could not be loaded — {error}
        </p>
      ) : null}

      {isLoading && combos.length === 0 ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 2 }).map((_v, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
            <div key={`combo-skeleton-${i}`} className="p-5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-5/6" />
            </div>
          ))}
        </div>
      ) : combos.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          No combos yet — create one to route traffic.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {combos.map((combo) => {
            const members = membersByCombo[combo.id] ?? [];
            // prefer the loaded member list; fall back to the server count
            // while members are still being fetched
            const targetCount = members.length || combo.memberCount;
            return (
              <div key={combo.id} className="p-5">
                <div className="flex min-w-0 items-center gap-2">
                  <Truncated
                    text={combo.name}
                    className="font-mono font-medium"
                  />
                  <Badge
                    variant="outline"
                    className="shrink-0 font-mono text-[11px]"
                  >
                    {combo.strategy === "fallback" ? "fallback" : "round_robin"}
                  </Badge>
                  <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                    {targetCount} target{targetCount === 1 ? "" : "s"}
                  </span>
                </div>
                {members.length === 0 ? (
                  <p className="mt-3 font-mono text-xs text-muted-foreground">
                    No targets configured
                  </p>
                ) : (
                  <ol className="mt-3 space-y-1.5">
                    {members.map((member, i) => {
                      const account = accountById(member.providerAccountId);
                      const bad = account && account.status !== "active";
                      const isCursor =
                        combo.strategy === "round_robin" &&
                        i === combo.roundRobinCursor;
                      return (
                        <li
                          key={member.id}
                          className="flex min-w-0 items-center gap-2 text-xs"
                        >
                          <span className="w-5 shrink-0 font-mono text-muted-foreground">
                            {combo.strategy === "fallback"
                              ? `#${member.priority}`
                              : isCursor
                                ? "▸"
                                : "·"}
                          </span>
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              bad ? "bg-destructive" : "bg-chart-3",
                            )}
                            title={
                              bad
                                ? `Account is ${account?.status}`
                                : "Account active"
                            }
                          />
                          {/* fixed basis so account + model columns line up
                              across every row instead of shifting per label */}
                          <span className="min-w-0 basis-32">
                            <Truncated
                              text={account?.label ?? member.providerAccountId}
                              className="font-mono"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <Truncated
                              text={member.modelName}
                              className="font-mono text-muted-foreground"
                            />
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                            {member.inputCostPer1M || member.outputCostPer1M
                              ? `$${member.inputCostPer1M ?? 0}/$${member.outputCostPer1M ?? 0} per 1M`
                              : "unpriced"}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
