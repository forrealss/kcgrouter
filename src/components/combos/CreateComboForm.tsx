import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import {
  Field,
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
import type { Combo } from "@/types/combo";

interface CreateComboFormProps {
  name: string;
  strategy: Combo["strategy"];
  isCreating: boolean;
  error: string | null;
  onNameChange: (name: string) => void;
  onStrategyChange: (strategy: Combo["strategy"]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export function CreateComboForm({
  name,
  strategy,
  isCreating,
  error,
  onNameChange,
  onStrategyChange,
  onSubmit,
  onCancel,
}: CreateComboFormProps) {
  return (
    <>
      <form id="create-combo-form" onSubmit={onSubmit} className="min-w-0">
        <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="combo-name">Combo name</FieldLabel>
            <Input
              id="combo-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="production-default"
              aria-invalid={Boolean(error)}
              disabled={isCreating}
              required
              autoFocus
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="combo-strategy">Strategy</FieldLabel>
            <Select
              value={strategy}
              onValueChange={(value) =>
                onStrategyChange(value as Combo["strategy"])
              }
              disabled={isCreating}
            >
              <SelectTrigger id="combo-strategy" className="w-full">
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="fallback">Fallback</SelectItem>
                  <SelectItem value="round_robin">Round-robin</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose asChild>
          <Button
            type="button"
            variant="outline"
            disabled={isCreating}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" form="create-combo-form" disabled={isCreating}>
          {isCreating ? <Spinner data-icon="inline-start" /> : null}
          Create combo
        </Button>
      </DialogFooter>
    </>
  );
}
