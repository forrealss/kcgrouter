import { AlertCircleIcon, PlusIcon } from "lucide-react";
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
import type { Provider, ProviderFormValues, ProviderTransport } from "./types";

interface ProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}

const initialValues: ProviderFormValues = {
  name: "",
  transport: "openai",
  baseUrl: "",
};

const transportLabels: Record<ProviderTransport, string> = {
  openai: "OpenAI-compatible",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};

export function ProviderFormDialog({
  open,
  onOpenChange,
  onSaved,
}: ProviderFormDialogProps) {
  const [values, setValues] = useState<ProviderFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setError(null);
    }
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return;
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = values.name.trim();
    const baseUrl = values.baseUrl.trim();

    if (!name || !baseUrl) {
      setError("Nama provider dan base URL wajib diisi.");
      return;
    }

    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Base URL harus menggunakan HTTP atau HTTPS.");
      }
    } catch (urlError) {
      setError(
        urlError instanceof Error && urlError.message.startsWith("Base URL")
          ? urlError.message
          : "Masukkan base URL yang valid.",
      );
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await apiClient.post<Provider>("/api/providers", {
        name,
        transport: values.transport,
        baseUrl,
      });
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
          <DialogTitle>Tambah provider</DialogTitle>
          <DialogDescription>
            Tambahkan endpoint upstream yang akan digunakan oleh router.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error && !values.name.trim())}>
              <FieldLabel htmlFor="provider-name">Nama provider</FieldLabel>
              <Input
                id="provider-name"
                value={values.name}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                disabled={isSubmitting}
                required
                autoFocus
                placeholder="OpenAI utama"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="provider-transport">Transport</FieldLabel>
              <Select
                value={values.transport}
                onValueChange={(transport: ProviderTransport) =>
                  setValues((current) => ({ ...current, transport }))
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="provider-transport" className="w-full">
                  <SelectValue placeholder="Pilih transport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(transportLabels) as ProviderTransport[]).map(
                      (transport) => (
                        <SelectItem key={transport} value={transport}>
                          {transportLabels[transport]}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={Boolean(error && !values.baseUrl.trim())}>
              <FieldLabel htmlFor="provider-base-url">Base URL</FieldLabel>
              <Input
                id="provider-base-url"
                type="url"
                inputMode="url"
                value={values.baseUrl}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
                disabled={isSubmitting}
                required
                placeholder="https://api.openai.com/v1"
              />
              <FieldDescription>
                URL dasar endpoint API provider, termasuk path versi bila
                diperlukan.
              </FieldDescription>
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Provider tidak dapat disimpan</AlertTitle>
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
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                Tambah provider
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
