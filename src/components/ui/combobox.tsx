import {
  CheckIcon,
  ChevronsUpDownIcon,
  type LucideIcon,
  PlusIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  /** Optional grouping key (e.g. provider name) used to section options. */
  group?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  allowCustom?: boolean;
  customLabel?: string;
  dialogTitle?: string;
  closeLabel?: string;
  noResultsLabel?: string;
  /** Optional render metadata per group (keyed by the option `group` value). */
  groupMeta?: Record<string, { icon?: string; iconComponent?: LucideIcon }>;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  allowCustom = true,
  customLabel = "Gunakan",
  dialogTitle,
  closeLabel = "Tutup",
  noResultsLabel = "Tidak ada opsi ditemukan",
  groupMeta,
  disabled = false,
  id,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedLabel =
    options.find((opt) => opt.value === value)?.label ?? value;

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = options.filter(
      (opt) =>
        term === "" ||
        opt.label.toLowerCase().includes(term) ||
        opt.value.toLowerCase().includes(term) ||
        (opt.description ?? "").toLowerCase().includes(term) ||
        (opt.group ?? "").toLowerCase().includes(term),
    );

    const map = new Map<string, ComboboxOption[]>();
    for (const opt of filtered) {
      const key = opt.group ?? "";
      const list = map.get(key);
      if (list) list.push(opt);
      else map.set(key, [opt]);
    }
    return Array.from(map.entries());
  }, [options, search]);

  const showCustomOption =
    allowCustom &&
    search.trim() !== "" &&
    !options.some(
      (opt) => opt.value.toLowerCase() === search.toLowerCase().trim(),
    );

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue);
    setOpen(false);
    setSearch("");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  };

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        id={id}
        className="w-full justify-between"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{value ? selectedLabel : placeholder}</span>
        <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle ?? placeholder}</DialogTitle>
          </DialogHeader>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9"
            autoFocus
          />

          <div className="-mx-2 max-h-80 overflow-y-auto px-2">
            {showCustomOption ? (
              <button
                type="button"
                onClick={() => handleSelect(search.trim())}
                className="mb-1 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <PlusIcon className="size-4 shrink-0" />
                <span className="truncate">
                  {customLabel} "{search.trim()}"
                </span>
              </button>
            ) : null}

            {groups.length === 0 && !showCustomOption ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                {noResultsLabel}
              </div>
            ) : null}

            {groups.length > 0 ? (
              <div className="flex flex-col gap-3">
                {groups.map(([groupName, groupOptions]) => {
                  const meta = groupName ? groupMeta?.[groupName] : undefined;
                  return (
                    <div key={groupName || "__ungrouped"}>
                      {groupName ? (
                        <div className="flex items-center gap-2 px-2 pb-1.5 text-sm font-semibold text-foreground">
                          {meta?.iconComponent ? (
                            <meta.iconComponent className="size-4 shrink-0 text-muted-foreground" />
                          ) : meta?.icon ? (
                            <img
                              src={meta.icon}
                              alt=""
                              aria-hidden
                              className="size-4 shrink-0 object-contain"
                            />
                          ) : null}
                          <span className="truncate">{groupName}</span>
                        </div>
                      ) : null}
                      <div className="flex flex-col">
                        {groupOptions.map((option) => {
                          const selected = value === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => handleSelect(option.value)}
                              aria-pressed={selected}
                              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">
                                  {option.label}
                                </span>
                                {option.description ? (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {option.description}
                                  </span>
                                ) : null}
                              </span>
                              {selected ? (
                                <CheckIcon
                                  className="size-4 shrink-0 text-primary"
                                  aria-hidden
                                />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {closeLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
