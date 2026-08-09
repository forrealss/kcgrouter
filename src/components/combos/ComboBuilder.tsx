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
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
    throw new Error("Biaya harus berupa angka nol atau lebih.");
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
  const [error, setError] = useState<string | null>(null);
  const [providerAccountId, setProviderAccountId] = useState("");
  const [modelName, setModelName] = useState("");
  const [inputCost, setInputCost] = useState("");
  const [outputCost, setOutputCost] = useState("");
  const [modelOptions, setModelOptions] = useState<ComboboxOption[]>([]);

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
      setError("Pilih akun provider terlebih dahulu.");
      return;
    }

    if (!modelName.trim()) {
      setError("Nama model wajib diisi.");
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

  async function handleMove(memberIndex: number, direction: -1 | 1) {
    const targetIndex = memberIndex + direction;
    if (targetIndex < 0 || targetIndex >= members.length || isReordering)
      return;

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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
      {error ? (
        <Alert variant="destructive" className="shrink-0">
          <AlertCircleIcon />
          <AlertTitle>Perubahan tidak dapat disimpan</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
          <Spinner />
          Memuat anggota dan akun provider…
        </div>
      ) : (
        <div className="grid min-h-0 gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Target</p>
              <Badge variant="outline" className="shrink-0 font-normal">
                {members.length}
              </Badge>
            </div>

            <div className="min-h-0 max-h-[min(55svh,28rem)] overflow-y-auto rounded-lg border bg-muted/20 p-2">
              <ol
                className="flex flex-col gap-2"
                aria-label="Urutan anggota combo"
              >
                {members.length === 0 ? (
                  <li className="flex min-h-40 items-center justify-center rounded-md border border-dashed bg-background/70 p-4 text-sm text-muted-foreground">
                    Belum ada target.
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
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Naikkan ${member.modelName}`}
                            title="Naikkan prioritas"
                            disabled={index === 0 || isReordering}
                            onClick={() => void handleMove(index, -1)}
                          >
                            <ArrowUpIcon />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Turunkan ${member.modelName}`}
                            title="Turunkan prioritas"
                            disabled={
                              index === members.length - 1 || isReordering
                            }
                            onClick={() => void handleMove(index, 1)}
                          >
                            <ArrowDownIcon />
                          </Button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ol>
            </div>
          </section>

          <section className="h-fit rounded-lg border bg-muted/20 p-4">
            <p className="mb-3 text-sm font-medium">Tambah target</p>

            <form onSubmit={handleAddMember}>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor={`provider-account-${combo.id}`}>
                    Koneksi provider
                  </FieldLabel>
                  <Select
                    value={providerAccountId || undefined}
                    onValueChange={setProviderAccountId}
                    disabled={isAdding || accounts.length === 0}
                  >
                    <SelectTrigger
                      id={`provider-account-${combo.id}`}
                      className="w-full bg-background"
                    >
                      <SelectValue placeholder="Pilih koneksi" />
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
                      Buat provider dan akun aktif terlebih dahulu.
                    </FieldDescription>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor={`model-name-${combo.id}`}>
                    Model target
                  </FieldLabel>
                  <Combobox
                    id={`model-name-${combo.id}`}
                    options={modelOptions}
                    value={modelName}
                    onValueChange={setModelName}
                    placeholder={
                      selectedAccount
                        ? "Pilih atau ketik model"
                        : "Pilih koneksi dulu"
                    }
                    searchPlaceholder="Cari model..."
                    allowCustom
                    disabled={isAdding || !selectedAccount}
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
                      Biaya / 1M (opsional)
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
                          placeholder="Opsional"
                          disabled={isAdding}
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
                          placeholder="Opsional"
                          disabled={isAdding}
                          className="bg-background"
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isAdding || accounts.length === 0}
                >
                  {isAdding ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <PlusIcon data-icon="inline-start" />
                  )}
                  Tambahkan
                </Button>
              </FieldGroup>
            </form>
          </section>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span className="mr-auto">
          {isAdding || isReordering ? "Menyimpan..." : "Tersimpan"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLoading || isAdding || isReordering}
          onClick={() => void loadBuilderData()}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Muat ulang
        </Button>
      </div>
    </div>
  );
}
