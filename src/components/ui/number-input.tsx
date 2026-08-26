import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

interface NumberInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "onChange" | "value"> {
  value: string;
  onValueChange: (next: string) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Value the first stepper click lands on while the field is empty. */
  fallback?: number;
  /** Suffix rendered inside the field, e.g. "s" for seconds. */
  unit?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Number field with custom stepper buttons. The native `type="number"` spinners
 * are drawn by the UA and ignore our tokens — they render near-white in light
 * mode and are barely visible — so they are suppressed and replaced with themed
 * chevrons that also give a comfortable hit area.
 */
function NumberInput({
  className,
  value,
  onValueChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  fallback,
  unit,
  disabled,
  ...props
}: NumberInputProps) {
  const base = fallback ?? min;

  function nudge(direction: 1 | -1) {
    const current = value.trim() === "" ? null : Number(value);
    if (current === null || !Number.isFinite(current)) {
      onValueChange(String(clamp(base, min, max)));
      return;
    }
    const next = clamp(current + direction * step, min, max);
    onValueChange(String(Number(next.toFixed(4))));
  }

  return (
    <div
      data-slot="number-input"
      data-disabled={disabled ? "" : undefined}
      className={cn(
        "flex h-8 w-full min-w-0 items-stretch rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
    >
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "min-w-0 flex-1 bg-transparent px-2.5 font-mono text-xs tabular-nums outline-none",
          "selection:bg-primary selection:text-primary-foreground placeholder:font-sans placeholder:text-muted-foreground",
          "disabled:pointer-events-none",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
        {...props}
      />
      {unit ? (
        <span
          aria-hidden
          className="flex select-none items-center pr-1 font-mono text-[11px] text-muted-foreground"
        >
          {unit}
        </span>
      ) : null}
      <div className="flex w-6 shrink-0 flex-col border-l border-input">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          onClick={() => nudge(1)}
          className="flex flex-1 items-center justify-center rounded-tr-[5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none"
        >
          <ChevronUpIcon className="size-3" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          onClick={() => nudge(-1)}
          className="flex flex-1 items-center justify-center rounded-br-[5px] border-t border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none"
        >
          <ChevronDownIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}

export { NumberInput };
