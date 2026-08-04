import { AlertCircleIcon, KeyRoundIcon, SaveIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type {
  AccountFormValues,
  ProviderAccount,
  QuotaResetType,
} from "@/types/provider";

interface AccountFormDialogProps {
  providerId: string;
  account?: ProviderAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}

const quotaResetLabels: Record<QuotaResetType, string> = {
  "5h": "Setiap 5 jam",
  daily: "Harian",
  weekly: "Mingguan",
  none: "Tanpa reset",
};

function getInitialValues(account?: ProviderAccount | null): AccountFormValues {
  return {
    label: account?.label ?? "",
    quotaResetType: account?.quotaResetType ?? "none",
    quotaLimitTokens: account?.quotaLimitTokens ?? null,
  };
}

export function AccountFormDialog({
  providerId,
  account,
  open,
  onOpenChange,
  onSaved,
}: AccountFormDialogProps) {
  const isEditing = Boolean(account);
  const [values, setValues] = useState<AccountFormValues>(() =>
    getInitialValues(account),
  );
  const [apiKey, setApiKey] = useState("");
  const [quotaLimit, setQuotaLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const initialValues = getInitialValues(account);
      setValues(initialValues);
      setApiKey("");
      setQuotaLimit(
        initialValues.quotaLimitTokens === null
          ? ""
          : String(initialValues.quotaLimitTokens),
      );
      setError(null);
    }
  }, [account, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return;
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const label = values.label.trim();
    const normalizedApiKey = apiKey.trim();
    const normalizedQuotaLimit = quotaLimit.trim();
    const parsedQuotaLimit = normalizedQuotaLimit
      ? Number(normalizedQuotaLimit)
      : null;

    if (!label) {
      setError("Label akun wajib diisi.");
      return;
    }

    if (!isEditing && !normalizedApiKey) {
      setError("API key wajib diisi saat menambahkan akun.");
      return;
    }

    if (
      parsedQuotaLimit !== null &&
      (!Number.isSafeInteger(parsedQuotaLimit) || parsedQuotaLimit <= 0)
    ) {
      setError("Batas kuota harus berupa bilangan bulat positif.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const payload: AccountFormValues = {
        label,
        quotaResetType: values.quotaResetType,
        quotaLimitTokens: parsedQuotaLimit,
        ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
      };

      if (account) {
        await apiClient.patch<ProviderAccount>(
          `/api/providers/accounts/${encodeURIComponent(account.id)}`,
          payload,
        );
      } else {
        await apiClient.post<ProviderAccount>(
          `/api/providers/${encodeURIComponent(providerId)}/accounts`,
          payload,
        );
      }

      await onSaved();
      onOpenChange(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Ubah akun" : "Tambah akun"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Perbarui konfigurasi akun upstream ini."
              : "Simpan kredensial untuk akun upstream baru."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="account-label">Label akun</FieldLabel>
              <Input
                id="account-label"
                value={values.label}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                disabled={isSubmitting}
                required
                autoFocus
                placeholder="Akun utama"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-api-key">API key</FieldLabel>
              <Input
                id="account-api-key"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={isSubmitting}
                required={!isEditing}
                placeholder={
                  isEditing
                    ? "Biarkan kosong untuk tetap memakai key saat ini"
                    : "Masukkan API key"
                }
              />
              <FieldDescription>
                {isEditing
                  ? "Key yang tersimpan tidak ditampilkan. Isi hanya untuk menggantinya."
                  : "API key disimpan secara aman dan tidak akan ditampilkan kembali."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="account-quota-reset">Reset kuota</FieldLabel>
              <Select
                value={values.quotaResetType}
                onValueChange={(quotaResetType: QuotaResetType) =>
                  setValues((current) => ({ ...current, quotaResetType }))
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="account-quota-reset" className="w-full">
                  <SelectValue placeholder="Pilih periode reset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(quotaResetLabels) as QuotaResetType[]).map(
                      (quotaResetType) => (
                        <SelectItem key={quotaResetType} value={quotaResetType}>
                          {quotaResetLabels[quotaResetType]}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="account-quota-limit">
                Batas kuota token
              </FieldLabel>
              <Input
                id="account-quota-limit"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quotaLimit}
                onChange={(event) => setQuotaLimit(event.target.value)}
                disabled={isSubmitting}
                placeholder="Tidak dibatasi"
              />
              <FieldDescription>
                Kosongkan untuk tidak menetapkan batas kuota token.
              </FieldDescription>
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Akun tidak dapat disimpan</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Spinner data-icon="inline-start" />
                ) : isEditing ? (
                  <SaveIcon data-icon="inline-start" />
                ) : (
                  <KeyRoundIcon data-icon="inline-start" />
                )}
                {isEditing ? "Simpan perubahan" : "Tambah akun"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
