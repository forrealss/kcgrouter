import { type FormEvent, useCallback, useEffect, useState } from "react";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import type { Combo, ComboMember } from "@/types/combo";

export type MemberMap = Record<string, ComboMember[]>;

export function useCombos() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [membersByCombo, setMembersByCombo] = useState<MemberMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const refreshCombos = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const nextCombos = await apiClient.get<Combo[]>("/api/combos");
      const members = await Promise.all(
        nextCombos.map(async (combo) => {
          const comboMembers = await apiClient.get<ComboMember[]>(
            `/api/combos/${encodeURIComponent(combo.id)}/members`,
          );
          return [
            combo.id,
            [...comboMembers].sort(
              (left, right) => left.priority - right.priority,
            ),
          ] as const;
        }),
      );

      setCombos(nextCombos);
      setMembersByCombo(Object.fromEntries(members));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCombos();
  }, [refreshCombos]);

  async function handleDeleteCombo(comboId: string) {
    setError(null);
    setIsDeletingId(comboId);

    try {
      await apiClient.delete(`/api/combos/${encodeURIComponent(comboId)}`);
      await refreshCombos();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsDeletingId(null);
    }
  }

  return {
    combos,
    membersByCombo,
    isLoading,
    error,
    isDeletingId,
    refreshCombos,
    handleDeleteCombo,
  };
}

export function useCreateCombo(onCreated: (combo: Combo) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState<Combo["strategy"]>("fallback");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setStrategy("fallback");
    setError(null);
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open && !isCreating) reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Nama combo wajib diisi.");
      return;
    }

    setIsCreating(true);
    try {
      const combo = await apiClient.post<Combo>("/api/combos", {
        name: name.trim(),
        strategy,
      });
      reset();
      setIsOpen(false);
      onCreated(combo);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsCreating(false);
    }
  }

  return {
    isOpen,
    name,
    strategy,
    isCreating,
    error,
    setName,
    setStrategy,
    setIsOpen,
    handleOpenChange,
    handleSubmit,
  };
}
