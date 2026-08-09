import {
  BoxesIcon,
  CheckIcon,
  type LucideIcon,
  PlusIcon,
  Star,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
  /** Optional secondary line shown in the empty state. */
  emptyHint?: string;
  /** Label for the active item badge. */
  activeLabel?: string;
  searchPlaceholder?: string;
  addLabel?: string;
  dialogTitle?: string;
  doneLabel?: string;
  noResultsLabel?: string;
  /** Optional render metadata per group (keyed by the option `group` value). */
  groupMeta?: Record<string, { icon?: string; iconComponent?: LucideIcon }>;
  disabled?: boolean;
  className?: string;
}

function shortLabel(value: string): string {
  const idx = value.indexOf("/");
  return idx >= 0 ? value.slice(idx + 1) : value;
}

export function MultiCombobox({
  options,
  value,
  onValueChange,
  activeValue,
  onActiveChange,
  emptyLabel = "Belum ada yang dipilih",
  emptyHint,
  activeLabel = "Active",
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
      {value.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{emptyLabel}</p>
            {emptyHint ? (
              <p className="text-xs text-muted-foreground">{emptyHint}</p>
            ) : null}
          </div>
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
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {value.map((val) => {
              const option = optionByValue(val);
              const isActive = val === activeValue;
              const groupIcon = option?.group
                ? groupMeta?.[option.group]?.icon
                : undefined;
              const GroupIcon = option?.group
                ? groupMeta?.[option.group]?.iconComponent
                : undefined;
              return (
                <div
                  key={val}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-background px-3 py-2 transition-colors",
                    isActive
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:border-muted-foreground/40",
                  )}
                >
                  {option?.group ? (
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50"
                      aria-hidden
                    >
                      {GroupIcon ? (
                        <GroupIcon className="size-4 text-muted-foreground" />
                      ) : groupIcon ? (
                        <img
                          src={groupIcon}
                          alt=""
                          className="size-4 object-contain"
                        />
                      ) : (
                        <BoxesIcon className="size-3.5 text-muted-foreground" />
                      )}
                    </span>
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {option?.label || option?.description || val}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {shortLabel(val)}
                    </p>
                  </div>

                  {isActive ? (
                    <Badge className="shrink-0 border-primary/30 bg-primary/10 font-normal text-primary">
                      <Star className="fill-current" />
                      {activeLabel}
                    </Badge>
                  ) : null}

                  <div className="flex shrink-0 items-center gap-0.5">
                    {onActiveChange && !isActive ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={disabled}
                        onClick={() => onActiveChange(val)}
                        aria-label={`Set ${val} as active`}
                        title="Set as active"
                      >
                        <Star className="size-3.5 text-muted-foreground" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={disabled}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleRemove(val)}
                      aria-label={`Hapus ${val}`}
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={disabled}
            onClick={() => setOpen(true)}
          >
            <PlusIcon data-icon="inline-start" />
            {addLabel}
          </Button>
        </>
      )}

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
                                  {option.label || shortLabel(option.value)}
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
