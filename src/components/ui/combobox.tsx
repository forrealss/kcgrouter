import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  allowCustom = true,
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase()),
  );

  // Add "Custom" option if search doesn't match any existing option
  const showCustomOption =
    allowCustom &&
    search.trim() !== "" &&
    !options.some(
      (opt) => opt.value.toLowerCase() === search.toLowerCase().trim(),
    );

  const allOptions = showCustomOption
    ? [
        ...filteredOptions,
        { value: search.trim(), label: `Gunakan "${search.trim()}"` },
      ]
    : filteredOptions;

  const selectedLabel =
    options.find((opt) => opt.value === value)?.label ?? value;

  const handleSelect = useCallback(
    (selectedValue: string) => {
      onValueChange(selectedValue);
      setOpen(false);
      setSearch("");
      setHighlightedIndex(0);
    },
    [onValueChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) =>
          prev < allOptions.length - 1 ? prev + 1 : 0,
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : allOptions.length - 1,
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (allOptions[highlightedIndex]) {
          handleSelect(allOptions[highlightedIndex].value);
        }
      } else if (event.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    },
    [allOptions, highlightedIndex, handleSelect],
  );

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between"
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{value ? selectedLabel : placeholder}</span>
        <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
      </Button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="border-b p-2">
            <input
              ref={inputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="w-full rounded-sm bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div
            ref={listRef}
            className="max-h-60 overflow-auto p-1"
            role="listbox"
          >
            {allOptions.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                Tidak ada opsi ditemukan
              </div>
            ) : (
              allOptions.map((option, index) => {
                const isCustom =
                  allowCustom &&
                  option.value === search.trim() &&
                  !options.some(
                    (opt) =>
                      opt.value.toLowerCase() === search.toLowerCase().trim(),
                  );

                return (
                  <div
                    key={option.value}
                    role="option"
                    tabIndex={-1}
                    aria-selected={value === option.value}
                    className={cn(
                      "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      value === option.value && "bg-accent",
                      index === highlightedIndex && "bg-accent",
                    )}
                    onClick={() => handleSelect(option.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelect(option.value);
                      }
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {isCustom ? (
                      <PlusIcon className="mr-2 size-4" />
                    ) : (
                      <CheckIcon
                        className={cn(
                          "mr-2 size-4",
                          value === option.value ? "opacity-100" : "opacity-0",
                        )}
                      />
                    )}
                    <span className="truncate">{option.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
