import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  CoinsIcon,
  type LucideIcon,
  PlusIcon,
  RefreshCwIcon,
  ServerIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { NumberInput } from "@/components/ui/number-input";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { transportMeta } from "@/lib/provider-meta";
import { accountStatusMeta, resolveAccountStatus } from "@/lib/provider-status";
import { cn } from "@/lib/utils";
import type { Combo, ComboMember } from "@/types/combo";
import type { Provider, ProviderAccount } from "@/types/provider";

interface AccountOption extends ProviderAccount {
  providerName: string;
}

interface ComboBuilderProps {
  combo: Combo;
  onChanged: (memberCount: number) => void | Promise<void>;
}

function comboMembersPath(comboId: string): string {
  return `/api/combos/${encodeURIComponent(comboId)}/members`;
}

function parseOptionalCost(value: string): number | undefined {
  if (!value.trim()) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Cost must be a number greater than or equal to zero.");
  }

  return parsed;
}

export function ComboBuilder({ combo, onChanged }: ComboBuilderProps) {
  const [members, setMembers] = useState<ComboMember[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isCostsOpen, setIsCostsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerAccountId, setProviderAccountId] = useState("");
  const [modelName, setModelName] = useState("");
  const [inputCost, setInputCost] = useState("");
  const [outputCost, setOutputCost] = useState("");
  const [modelOptions, setModelOptions] = useState<ComboboxOption[]>([]);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"account" | "model", string>>
  >({});
  const isMutating = isAdding || isReordering || removingMemberId !== null;

  const loadMembers = useCallback(async () => {
    const nextMembers = await apiClient.get<ComboMember[]>(
      comboMembersPath(combo.id),
    );
    setMembers(
      [...nextMembers].sort((left, right) => left.priority - right.priority),
    );
  }, [combo.id]);

  const loadBuilderData = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const [nextMembers, providers] = await Promise.all([
        apiClient.get<ComboMember[]>(comboMembersPath(combo.id)),
        apiClient.get<Provider[]>("/api/providers"),
      ]);
      const accountsByProvider = await Promise.all(
        providers.map(async (provider) => {
          const providerAccounts = await apiClient.get<ProviderAccount[]>(
            `/api/providers/${encodeURIComponent(provider.id)}/accounts`,
          );
          return providerAccounts.map((account) => ({
            ...account,
            providerName: provider.name,
          }));
        }),
      );

      setMembers(
        [...nextMembers].sort((left, right) => left.priority - right.priority),
      );
      setProviders(providers);
      setAccounts(accountsByProvider.flat());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [combo.id]);

  useEffect(() => {
    void loadBuilderData();
  }, [loadBuilderData]);

  // Fetch models (default + custom) when provider account changes
  useEffect(() => {
    if (!providerAccountId) {
      setModelOptions([]);
      return;
    }

    const account = accounts.find((a) => a.id === providerAccountId);
    if (!account) {
      setModelOptions([]);
      return;
    }

    let isCurrent = true;
    const fetchModels = async () => {
      try {
        const provider = providers.find((p) => p.id === account.providerId);
        if (!provider) {
          if (isCurrent) setModelOptions([]);
          return;
        }

        // Fetch both default registry models AND custom DB models in parallel
        const [defaultModels, customModels] = await Promise.all([
          apiClient
            .get<Array<{ id: string; name: string }>>(
              `/api/providers/models/${provider.transport}`,
            )
            .catch(() => [] as Array<{ id: string; name: string }>),
          apiClient
            .get<
              Array<{
                id: string;
                modelId: string;
                modelName: string;
              }>
            >(`/api/providers/${encodeURIComponent(provider.id)}/models`)
            .catch(
              () =>
                [] as Array<{ id: string; modelId: string; modelName: string }>,
            ),
        ]);

        const customValueSet = new Set(customModels.map((m) => m.modelId));

        // Registry models (skip if a custom model with the same modelId exists)
        const registryOptions: ComboboxOption[] = defaultModels
          .filter((m) => !customValueSet.has(m.id))
          .map((m) => ({ value: m.id, label: m.name }));

        // Custom DB models
        const customOptions: ComboboxOption[] = customModels.map((m) => ({
          value: m.modelId,
          label: m.modelName,
        }));

        if (isCurrent) setModelOptions([...customOptions, ...registryOptions]);
      } catch {
        if (isCurrent) setModelOptions([]);
      }
    };

    void fetchModels();
    return () => {
      isCurrent = false;
    };
  }, [providerAccountId, accounts, providers]);

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedModel = modelName.trim();
    const nextFieldErrors: Partial<Record<"account" | "model", string>> = {};

    if (!providerAccountId) {
      nextFieldErrors.account = "Pick the connection this target routes to.";
    }
    if (!trimmedModel) {
      nextFieldErrors.model = "A model name is required.";
    } else if (
      members.some(
        (existing) =>
          existing.providerAccountId === providerAccountId &&
          existing.modelName.toLowerCase() === trimmedModel.toLowerCase(),
      )
    ) {
      // Same connection + same model would never be reached by the engine:
      // fallback stops at the first match, round-robin just repeats the call.
      nextFieldErrors.model =
        "This connection already routes that model in this combo.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }
    setFieldErrors({});

    let inputCostPer1M: number | undefined;
    let outputCostPer1M: number | undefined;
    try {
      inputCostPer1M = parseOptionalCost(inputCost);
      outputCostPer1M = parseOptionalCost(outputCost);
    } catch (validationError) {
      setError(getApiErrorMessage(validationError));
      return;
    }

    setIsAdding(true);
    try {
      const member = await apiClient.post<ComboMember>(
        comboMembersPath(combo.id),
        {
          providerAccountId,
          modelName: modelName.trim(),
          priority: members.length,
          ...(inputCostPer1M === undefined ? {} : { inputCostPer1M }),
          ...(outputCostPer1M === undefined ? {} : { outputCostPer1M }),
        },
      );

      setMembers((currentMembers) => [...currentMembers, member]);
      setProviderAccountId("");
      setModelName("");
      setInputCost("");
      setOutputCost("");
      await onChanged(members.length + 1);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemoveMember(member: ComboMember) {
    setError(null);
    setRemovingMemberId(member.id);

    try {
      await apiClient.delete(
        `${comboMembersPath(combo.id)}/${encodeURIComponent(member.id)}`,
      );
      const nextMembers = members
        .filter((candidate) => candidate.id !== member.id)
        .map((candidate, index) => ({ ...candidate, priority: index }));
      setMembers(nextMembers);
      await onChanged(nextMembers.length);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleMove(memberIndex: number, direction: -1 | 1) {
    const targetIndex = memberIndex + direction;
    if (targetIndex < 0 || targetIndex >= members.length || isMutating) return;

    const reorderedMembers = [...members];
    const member = reorderedMembers[memberIndex];
    const targetMember = reorderedMembers[targetIndex];
    if (!member || !targetMember) return;

    reorderedMembers[memberIndex] = targetMember;
    reorderedMembers[targetIndex] = member;
    setError(null);
    setMembers(reorderedMembers);
    setIsReordering(true);

    try {
      await apiClient.patch<{ ok: true }>(
        `${comboMembersPath(combo.id)}/reorder`,
        { orderedMemberIds: reorderedMembers.map(({ id }) => id) },
      );
      await onChanged(reorderedMembers.length);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
      try {
        await loadMembers();
      } catch (refreshError) {
        setError(getApiErrorMessage(refreshError));
      }
    } finally {
      setIsReordering(false);
    }
  }

  const selectedAccount = accounts.find(
    (account) => account.id === providerAccountId,
  );
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  /**
   * Connections grouped by provider, so the picker shows which upstream each
   * key belongs to and flags keys that are not currently usable.
   */
  const accountOptions: ComboboxOption[] = accounts.map((account) => {
    const statusKey = resolveAccountStatus(account);
    return {
      value: account.id,
      label: account.label,
      description:
        statusKey === "active"
          ? undefined
          : `${accountStatusMeta[statusKey].label} — may be skipped when routing`,
      group: account.providerName,
    };
  });

  const accountGroupMeta = useMemo(() => {
    const entries: Record<
      string,
      { icon?: string; iconComponent?: LucideIcon }
    > = {};
    for (const provider of providers) {
      const meta = transportMeta[provider.transport];
      entries[provider.name] = meta.icon
        ? { icon: meta.icon }
        : { iconComponent: meta.fallbackIcon };
    }
    return entries;
  }, [providers]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 md:overflow-hidden sm:px-6 sm:py-5">
      {error ? (
        <Alert variant="destructive" className="shrink-0">
          <AlertCircleIcon />
          <AlertTitle>Changes could not be saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
          <Spinner />
          Loading members and provider accounts…
        </div>
      ) : (
        <div className="grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
          <section className="flex min-w-0 flex-col gap-3 md:min-h-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Targets</p>
                <p className="text-xs text-muted-foreground">
                  Order determines routing priority.
                </p>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 font-mono text-[11px]"
              >
                {members.length.toString().padStart(2, "0")}
              </Badge>
            </div>

            <div className="scrollbar-subtle min-h-0 rounded-lg border border-border/70 bg-muted/20 p-2 md:flex-1 md:overflow-y-auto">
              <ol
                className="flex flex-col gap-2"
                aria-label="Combo member order"
              >
                {members.length === 0 ? (
                  <li className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-background/70 p-6 text-center">
                    <span
                      className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/50 text-muted-foreground"
                      aria-hidden
                    >
                      <TargetIcon className="size-5" />
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="text-sm font-medium">
                        No targets yet
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {combo.strategy === "fallback"
                          ? "Add one on the right. The first target is tried first."
                          : "Add targets on the right to rotate requests across them."}
                      </span>
                    </span>
                  </li>
                ) : (
                  members.map((member, index) => {
                    const account = accountById.get(member.providerAccountId);
                    return (
                      <li
                        key={member.id}
                        className="group relative flex items-center gap-2 rounded-md border bg-background p-2.5 transition-colors hover:border-primary/35 hover:bg-muted/20"
                      >
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {member.modelName}
                          </p>
                          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            <ServerIcon className="size-3 shrink-0" />
                            <span className="truncate">
                              {account
                                ? `${account.providerName} · ${account.label}`
                                : member.providerAccountId}
                            </span>
                          </p>
                          {member.inputCostPer1M !== null ||
                          member.outputCostPer1M !== null ? (
                            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <CoinsIcon className="size-3" />
                              {member.inputCostPer1M ?? "—"} input ·{" "}
                              {member.outputCostPer1M ?? "—"} output / 1M
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Move ${member.modelName} up`}
                            title="Move up"
                            disabled={index === 0 || isMutating}
                            onClick={() => void handleMove(index, -1)}
                          >
                            <ArrowUpIcon />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Move ${member.modelName} down`}
                            title="Move down"
                            disabled={
                              index === members.length - 1 || isMutating
                            }
                            onClick={() => void handleMove(index, 1)}
                          >
                            <ArrowDownIcon />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                disabled={isMutating}
                                aria-label={`Remove ${member.modelName} from combo`}
                                title="Remove target"
                              >
                                {removingMemberId === member.id ? (
                                  <Spinner className="size-3.5" />
                                ) : (
                                  <Trash2Icon className="size-3.5" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete target?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {member.modelName} will be removed and the
                                  remaining order compacted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isMutating}>
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  disabled={isMutating}
                                  onClick={() =>
                                    void handleRemoveMember(member)
                                  }
                                >
                                  Delete target
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </li>
                    );
                  })
                )}
              </ol>
            </div>
          </section>

          <section className="flex h-fit flex-col gap-0 overflow-hidden rounded-lg border border-border/70">
            <div className="flex items-start gap-2.5 border-b border-border/60 bg-muted/30 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                <PlusIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Add target</p>
                <p className="text-xs text-muted-foreground">
                  {combo.strategy === "fallback"
                    ? `Appended as fallback #${members.length + 1}.`
                    : "Appended to the rotation."}
                </p>
              </div>
            </div>

            {accounts.length === 0 ? (
              <div className="flex flex-col gap-2 px-4 py-4">
                <p className="text-sm font-medium">No connections available</p>
                <p className="text-xs text-muted-foreground">
                  A combo target points at a provider connection. Add a provider
                  with at least one API key first.
                </p>
              </div>
            ) : (
              <form onSubmit={handleAddMember} className="px-4 py-4">
                <FieldGroup className="gap-4">
                  <Field
                    data-invalid={Boolean(fieldErrors.account)}
                    className="gap-2"
                  >
                    <FieldLabel
                      htmlFor={`provider-account-${combo.id}`}
                      className="text-xs"
                    >
                      Provider connection
                    </FieldLabel>
                    <Combobox
                      id={`provider-account-${combo.id}`}
                      options={accountOptions}
                      value={providerAccountId}
                      onValueChange={(next) => {
                        setProviderAccountId(next);
                        setFieldErrors((current) => ({
                          ...current,
                          account: undefined,
                        }));
                        setError(null);
                      }}
                      placeholder="Select connection"
                      searchPlaceholder="Search connections..."
                      dialogTitle="Select provider connection"
                      allowCustom={false}
                      groupMeta={accountGroupMeta}
                      noResultsLabel="No connections found"
                      disabled={isMutating}
                    />
                    {fieldErrors.account ? (
                      <FieldError>{fieldErrors.account}</FieldError>
                    ) : null}
                  </Field>
                  <Field
                    data-invalid={Boolean(fieldErrors.model)}
                    className="gap-2"
                  >
                    <FieldLabel
                      htmlFor={`model-name-${combo.id}`}
                      className="text-xs"
                    >
                      Target model
                    </FieldLabel>
                    <Combobox
                      id={`model-name-${combo.id}`}
                      options={modelOptions}
                      value={modelName}
                      onValueChange={(next) => {
                        setModelName(next);
                        setFieldErrors((current) => ({
                          ...current,
                          model: undefined,
                        }));
                        setError(null);
                      }}
                      placeholder={
                        selectedAccount
                          ? "Select or type a model"
                          : "Select a connection first"
                      }
                      searchPlaceholder="Search models..."
                      dialogTitle="Select target model"
                      allowCustom
                      customLabel="Use custom model"
                      disabled={isMutating || !selectedAccount}
                    />
                    <FieldDescription className="text-xs">
                      {selectedAccount
                        ? "Pick from the provider catalog, or type any model ID it accepts."
                        : "Choose a connection to load its model catalog."}
                    </FieldDescription>
                    {fieldErrors.model ? (
                      <FieldError>{fieldErrors.model}</FieldError>
                    ) : null}
                  </Field>
                  <div className="rounded-md border border-border/70">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-xs font-medium transition-colors hover:bg-accent/40"
                      onClick={() => setIsCostsOpen((open) => !open)}
                      aria-expanded={isCostsOpen}
                    >
                      <span className="flex items-center gap-2">
                        <CoinsIcon className="size-3.5 text-muted-foreground" />
                        Cost per 1M tokens
                        <span className="font-normal text-muted-foreground">
                          optional
                        </span>
                      </span>
                      <ChevronRightIcon
                        className={cn(
                          "size-3.5 shrink-0 text-muted-foreground transition-transform",
                          isCostsOpen && "rotate-90",
                        )}
                      />
                    </button>
                    {isCostsOpen ? (
                      <div className="flex flex-col gap-3 border-t border-border/60 p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field className="gap-1.5">
                            <FieldLabel
                              htmlFor={`input-cost-${combo.id}`}
                              className="text-xs"
                            >
                              Input
                            </FieldLabel>
                            <NumberInput
                              id={`input-cost-${combo.id}`}
                              value={inputCost}
                              onValueChange={setInputCost}
                              min={0}
                              step={0.5}
                              unit="$"
                              placeholder="—"
                              disabled={isMutating}
                            />
                          </Field>
                          <Field className="gap-1.5">
                            <FieldLabel
                              htmlFor={`output-cost-${combo.id}`}
                              className="text-xs"
                            >
                              Output
                            </FieldLabel>
                            <NumberInput
                              id={`output-cost-${combo.id}`}
                              value={outputCost}
                              onValueChange={setOutputCost}
                              min={0}
                              step={0.5}
                              unit="$"
                              placeholder="—"
                              disabled={isMutating}
                            />
                          </Field>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Used to report spend for this target. Leave blank if
                          you do not track cost.
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isMutating}
                  >
                    {isAdding ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <PlusIcon data-icon="inline-start" />
                    )}
                    Add target
                  </Button>
                </FieldGroup>
              </form>
            )}
          </section>
        </div>
      )}

      <div className="sticky bottom-0 z-10 mt-4 flex h-11 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-background/95 backdrop-blur md:static md:bg-transparent md:backdrop-blur-none">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {isMutating ? (
            <>
              <Spinner className="size-3" />
              Saving…
            </>
          ) : (
            <>
              <span
                className="size-1.5 rounded-full bg-success shadow-[0_0_6px] shadow-success/70"
                aria-hidden
              />
              Saved
            </>
          )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-2 text-muted-foreground hover:text-foreground"
          disabled={isLoading || isMutating}
          onClick={() => void loadBuilderData()}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
