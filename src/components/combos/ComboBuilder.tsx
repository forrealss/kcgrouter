import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
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
  Field,
  FieldDescription,
  FieldError,
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
import type { Combo, ComboMember } from "./types";

interface Provider {
  id: string;
  name: string;
  transport: "openai" | "anthropic" | "gemini";
  baseUrl: string;
  createdAt: string;
  accountCount?: number;
}

interface ProviderAccount {
  id: string;
  providerId: string;
  label: string;
  status: "active" | "error" | "expired";
  quotaResetType: "5h" | "daily" | "weekly" | "none";
  quotaLimitTokens: number | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface AccountOption extends ProviderAccount {
  providerName: string;
}

interface ComboBuilderProps {
  combo: Combo;
  onChanged: () => void | Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerAccountId, setProviderAccountId] = useState("");
  const [modelName, setModelName] = useState("");
  const [inputCost, setInputCost] = useState("");
  const [outputCost, setOutputCost] = useState("");

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
      await onChanged();
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
      await onChanged();
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kelola anggota {combo.name}</CardTitle>
        <CardDescription>
          Tambahkan target model dan atur urutannya untuk strategi{" "}
          {combo.strategy === "fallback" ? "fallback" : "round-robin"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Perubahan tidak dapat disimpan</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Memuat anggota dan akun provider…
          </div>
        ) : (
          <>
            <ol
              className="flex flex-col gap-2"
              aria-label="Urutan anggota combo"
            >
              {members.length === 0 ? (
                <li className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Belum ada anggota. Tambahkan target pertama di bawah ini.
                </li>
              ) : (
                members.map((member, index) => (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="secondary">{index + 1}</Badge>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {member.modelName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          Akun: {member.providerAccountId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        aria-label={`Naikkan ${member.modelName}`}
                        title="Naikkan prioritas"
                        disabled={index === 0 || isReordering}
                        onClick={() => void handleMove(index, -1)}
                      >
                        <ArrowUpIcon data-icon="inline-start" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        aria-label={`Turunkan ${member.modelName}`}
                        title="Turunkan prioritas"
                        disabled={index === members.length - 1 || isReordering}
                        onClick={() => void handleMove(index, 1)}
                      >
                        <ArrowDownIcon data-icon="inline-start" />
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ol>

            <form onSubmit={handleAddMember}>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor={`provider-account-${combo.id}`}>
                    Akun provider
                  </FieldLabel>
                  <Select
                    value={providerAccountId || undefined}
                    onValueChange={setProviderAccountId}
                    disabled={isAdding || accounts.length === 0}
                  >
                    <SelectTrigger
                      id={`provider-account-${combo.id}`}
                      className="w-full"
                    >
                      <SelectValue placeholder="Pilih akun provider" />
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
                      Buat provider dan akun aktif sebelum menambahkan anggota.
                    </FieldDescription>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor={`model-name-${combo.id}`}>
                    Nama model
                  </FieldLabel>
                  <Input
                    id={`model-name-${combo.id}`}
                    value={modelName}
                    onChange={(event) => setModelName(event.target.value)}
                    placeholder="mis. gpt-4.1-mini"
                    disabled={isAdding}
                    required
                  />
                </Field>
                <FieldGroup className="gap-4 sm:flex-row">
                  <Field>
                    <FieldLabel htmlFor={`input-cost-${combo.id}`}>
                      Biaya input / 1M
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
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`output-cost-${combo.id}`}>
                      Biaya output / 1M
                    </FieldLabel>
                    <Input
                      id={`output-cost-${combo.id}`}
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={outputCost}
                      onChange={(event) => setOutputCost(event.target.value)}
                      placeholder="Opsional"
                      disabled={isAdding}
                    />
                  </Field>
                </FieldGroup>
                <FieldError>{error}</FieldError>
                <Button
                  type="submit"
                  disabled={isAdding || accounts.length === 0}
                >
                  {isAdding ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <PlusIcon data-icon="inline-start" />
                  )}
                  Tambahkan anggota
                </Button>
              </FieldGroup>
            </form>
          </>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-3 text-sm text-muted-foreground">
        <span>{members.length} anggota</span>
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
      </CardFooter>
    </Card>
  );
}
