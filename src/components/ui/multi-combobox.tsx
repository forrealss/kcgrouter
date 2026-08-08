import { CheckIcon, PlusIcon, Star, XIcon } from "lucide-react";
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

export interface MultiComboboxOption {
  value: string;
  label: string;
  description?: string;
  /** Optional grouping key (e.g. provider name) used to section options. */
  group?: string;
}

interface MultiComboboxProps {
  options: MultiComboboxOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  /** Currently active/primary item among the selected values. */
  activeValue?: string;
  /** Called when the user marks an item as active via the star toggle. */
  onActiveChange?: (value: string) => void;
  emptyLabel?: string;
  searchPlaceholder?: string;
  addLabel?: string;
  dialogTitle?: string;
  doneLabel?: string;
  noResultsLabel?: string;
  /** Optional render metadata per group (keyed by the option `group` value). */
  groupMeta?: Record<string, { icon?: string }>;
  disabled?: boolean;
  className?: string;
}

function shortLabel(option: MultiComboboxOption): string {
  const idx = option.value.indexOf("/");
  return idx >= 0 ? option.value.slice(idx + 1) : option.value;
}

export function MultiCombobox({
  options,
  value,
  onValueChange,
  activeValue,
  onActiveChange,
  emptyLabel = "Belum ada yang dipilih",
  searchPlaceholder = "Cari...",
  addLabel = "Tambah",
  dialogTitle,
  doneLabel = "Selesai",
  noResultsLabel = "Tidak ada opsi ditemukan",
  groupMeta,
  disabled = false,
  className,
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const optionByValue = useMemo(() => {
    const map = new Map(options.map((opt) => [opt.value, opt]));
    return (val: string) => map.get(val);
  }, [options]);

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

    const map = new Map<string, MultiComboboxOption[]>();
    for (const opt of filtered) {
      const key = opt.group ?? "";
      const list = map.get(key);
      if (list) list.push(opt);
      else map.set(key, [opt]);
    }
    return Array.from(map.entries());
  }, [options, search]);

  const handleToggle = (toggledValue: string) => {
    if (value.includes(toggledValue)) {
      const next = value.filter((v) => v !== toggledValue);
      onValueChange(next);
      if (activeValue === toggledValue) onActiveChange?.(next[0] ?? "");
    } else {
      onValueChange([...value, toggledValue]);
      if (!activeValue) onActiveChange?.(toggledValue);
    }
  };

  const handleRemove = (removedValue: string) => {
    const next = value.filter((v) => v !== removedValue);
    onValueChange(next);
    if (activeValue === removedValue) onActiveChange?.(next[0] ?? "");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 ? (
          <span className="text-xs text-muted-foreground">{emptyLabel}</span>
        ) : (
          value.map((val) => {
            const option = optionByValue(val);
            const isActive = val === activeValue;
            return (
              <span
                key={val}
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-secondary text-secondary-foreground",
                )}
              >
                {onActiveChange ? (
                  <button
                    type="button"
                    onClick={() => onActiveChange(val)}
                    disabled={disabled}
                    className="shrink-0 rounded-sm p-0.5 hover:bg-black/5 dark:hover:bg-white/10 disabled:pointer-events-none"
                    aria-label={
                      isActive ? `${val} aktif` : `Jadikan ${val} aktif`
                    }
                    title={isActive ? "Aktif" : "Jadikan aktif"}
                  >
                    <Star
                      className={cn(
                        "size-3",
                        isActive
                          ? "fill-primary text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                  </button>
                ) : null}
                <span className="font-mono">{option?.label ?? val}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(val)}
                  disabled={disabled}
                  className="shrink-0 rounded-sm p-0.5 hover:bg-black/10 dark:hover:bg-white/10 disabled:pointer-events-none"
                  aria-label={`Hapus ${val}`}
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            );
          })
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <PlusIcon data-icon="inline-start" />
          {addLabel}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle ?? addLabel}</DialogTitle>
          </DialogHeader>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9"
            autoFocus
          />

          <div className="-mx-2 max-h-80 overflow-y-auto px-2">
            {groups.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                {noResultsLabel}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map(([groupName, groupOptions]) => {
                  const meta = groupName ? groupMeta?.[groupName] : undefined;
                  return (
                    <div key={groupName || "__ungrouped"}>
                      {groupName ? (
                        <div className="flex items-center gap-2 px-2 pb-1.5 text-sm font-semibold text-foreground">
                          {meta?.icon ? (
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
                          const selected = value.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => handleToggle(option.value)}
                              aria-pressed={selected}
                              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <span
                                className={cn(
                                  "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                                  selected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-muted-foreground/40",
                                )}
                                aria-hidden
                              >
                                {selected ? (
                                  <CheckIcon className="size-3" />
                                ) : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-mono text-xs">
                                  {shortLabel(option)}
                                </span>
                                {option.description ? (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {option.description}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => handleOpenChange(false)}>
              {doneLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
