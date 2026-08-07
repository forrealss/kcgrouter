import { PlusIcon, Star, XIcon } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MultiComboboxOption {
  value: string;
  label: string;
  description?: string;
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
  disabled?: boolean;
  className?: string;
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
  disabled = false,
  className,
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter(
    (opt) =>
      !value.includes(opt.value) &&
      (opt.label.toLowerCase().includes(search.toLowerCase()) ||
        opt.value.toLowerCase().includes(search.toLowerCase())),
  );

  const optionByValue = useCallback(
    (val: string) => options.find((opt) => opt.value === val),
    [options],
  );

  const handleAdd = useCallback(
    (selectedValue: string) => {
      if (!value.includes(selectedValue)) {
        onValueChange([...value, selectedValue]);
        if (!activeValue) onActiveChange?.(selectedValue);
      }
      setSearch("");
      setHighlightedIndex(0);
      inputRef.current?.focus();
    },
    [value, onValueChange, activeValue, onActiveChange],
  );

  const handleRemove = useCallback(
    (removedValue: string) => {
      const next = value.filter((v) => v !== removedValue);
      onValueChange(next);
      if (activeValue === removedValue) {
        onActiveChange?.(next[0] ?? "");
      }
    },
    [value, onValueChange, activeValue, onActiveChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) =>
          filteredOptions.length === 0
            ? 0
            : prev < filteredOptions.length - 1
              ? prev + 1
              : 0,
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) =>
          filteredOptions.length === 0
            ? 0
            : prev > 0
              ? prev - 1
              : filteredOptions.length - 1,
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        const option = filteredOptions[highlightedIndex];
        if (option) handleAdd(option.value);
      } else if (event.key === "Backspace" && search === "" && value.length) {
        const last = value[value.length - 1];
        if (last) handleRemove(last);
      } else if (event.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    },
    [filteredOptions, highlightedIndex, handleAdd, search, value, handleRemove],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && !open ? (
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

        <div ref={containerRef} className="relative">
          {open ? (
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              disabled={disabled}
              className="h-7 w-40 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          ) : (
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
          )}

          {open ? (
            <div className="absolute z-50 mt-1 w-56 max-h-52 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
              {filteredOptions.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Tidak ada opsi ditemukan
                </div>
              ) : (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleAdd(option.value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground",
                      index === highlightedIndex &&
                        "bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="truncate font-mono">{option.label}</span>
                    {option.description ? (
                      <span className="ml-auto shrink-0 truncate text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
