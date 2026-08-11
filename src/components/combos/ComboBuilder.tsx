import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  CoinsIcon,
  PlusIcon,
  RefreshCwIcon,
  ServerIcon,
  Settings2Icon,
  Trash2Icon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
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

    if (!providerAccountId) {
      setError("Select a provider account first.");
      return;
    }

    if (!modelName.trim()) {
      setError("Model name is required.");
      return;
    }

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
                  <li className="flex min-h-40 items-center justify-center rounded-md border border-dashed bg-background/70 p-4 text-sm text-muted-foreground">
                    No targets yet.
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
                                title="Remove target from combo"
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
                                  {member.modelName} will be removed from the
                                  combo and the remaining target order will be
                                  compacted.
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

          <section className="h-fit rounded-lg border border-border/70 bg-muted/20 p-4">
            <div className="mb-3 flex items-start gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background/70 text-primary">
                <PlusIcon className="size-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium">Add target</p>
                <p className="text-xs text-muted-foreground">
                  Add a provider model to the routing order.
                </p>
              </div>
            </div>

            <form onSubmit={handleAddMember}>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor={`provider-account-${combo.id}`}>
                    Provider connection
                  </FieldLabel>
                  <Select
                    value={providerAccountId || undefined}
                    onValueChange={setProviderAccountId}
                    disabled={isMutating || accounts.length === 0}
                  >
                    <SelectTrigger
                      id={`provider-account-${combo.id}`}
                      className="w-full bg-background"
                    >
                      <SelectValue placeholder="Select connection" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.providerName} — {account.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {accounts.length === 0 ? (
                    <FieldDescription>
                      Create a provider and an active account first.
                    </FieldDescription>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor={`model-name-${combo.id}`}>
                    Target model
                  </FieldLabel>
                  <Combobox
                    id={`model-name-${combo.id}`}
                    options={modelOptions}
                    value={modelName}
                    onValueChange={setModelName}
                    placeholder={
                      selectedAccount
                        ? "Select or type a model"
                        : "Select a connection first"
                    }
                    searchPlaceholder="Search models..."
                    allowCustom
                    disabled={isMutating || !selectedAccount}
                  />
                </Field>
                <div className="rounded-md border bg-background/70">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-3 text-left text-xs font-medium transition-colors hover:bg-accent/50"
                    onClick={() => setIsCostsOpen((open) => !open)}
                    aria-expanded={isCostsOpen}
                  >
                    <span className="flex items-center gap-2">
                      <Settings2Icon className="size-3.5 text-muted-foreground" />
                      Cost / 1M (optional)
                    </span>
                    <ChevronRightIcon
                      className={`size-3.5 text-muted-foreground transition-transform ${isCostsOpen ? "rotate-90" : ""}`}
                    />
                  </button>
                  {isCostsOpen ? (
                    <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`input-cost-${combo.id}`}>
                          Input / 1M
                        </FieldLabel>
                        <Input
                          id={`input-cost-${combo.id}`}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={inputCost}
                          onChange={(event) => setInputCost(event.target.value)}
                          placeholder="Optional"
                          disabled={isMutating}
                          className="bg-background"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`output-cost-${combo.id}`}>
                          Output / 1M
                        </FieldLabel>
                        <Input
                          id={`output-cost-${combo.id}`}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={outputCost}
                          onChange={(event) =>
                            setOutputCost(event.target.value)
                          }
                          placeholder="Optional"
                          disabled={isMutating}
                          className="bg-background"
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isMutating || accounts.length === 0}
                >
                  {isAdding ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <PlusIcon data-icon="inline-start" />
                  )}
                  Add
                </Button>
              </FieldGroup>
            </form>
          </section>
        </div>
      )}

      <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-end gap-3 border-t bg-background/95 py-3 text-xs text-muted-foreground backdrop-blur md:static md:bg-transparent md:py-3 md:backdrop-blur-none">
        <span className="mr-auto">{isMutating ? "Saving..." : "Saved"}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
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
