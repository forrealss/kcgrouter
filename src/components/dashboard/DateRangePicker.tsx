import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateRangeValue {
  from: Date;
  to: Date;
}

interface DateRangePreset {
  key: string;
  label: string;
  getRange: () => DateRangeValue;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const PRESETS: readonly DateRangePreset[] = [
  {
    key: "today",
    label: "Hari ini",
    getRange: () => ({
      from: startOfDay(new Date()),
      to: endOfDay(new Date()),
    }),
  },
  {
    key: "7d",
    label: "7 hari",
    getRange: () => ({
      from: startOfDay(daysAgo(6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    key: "30d",
    label: "30 hari",
    getRange: () => ({
      from: startOfDay(daysAgo(29)),
      to: endOfDay(new Date()),
    }),
  },
  {
    key: "this-month",
    label: "Bulan ini",
    getRange: () => {
      const now = new Date();
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
      };
    },
  },
  {
    key: "last-month",
    label: "Bulan lalu",
    getRange: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(from), to: endOfDay(to) };
    },
  },
] as const;

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatRangeLabel(range: DateRangeValue): string {
  return `${dateFmt.format(range.from)} – ${dateFmt.format(range.to)}`;
}

/** Detects which preset (if any) matches the current range, for highlighting. */
function matchPreset(range: DateRangeValue): string | null {
  for (const preset of PRESETS) {
    const candidate = preset.getRange();
    if (
      startOfDay(candidate.from).getTime() ===
        startOfDay(range.from).getTime() &&
      startOfDay(candidate.to).getTime() === startOfDay(range.to).getTime()
    ) {
      return preset.key;
    }
  }
  return null;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
}

/**
 * Popover with a preset column (Hari ini / 7 hari / 30 hari / Bulan ini /
 * Bulan lalu) plus a two-month range Calendar for custom selections.
 */
export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({
    from: value.from,
    to: value.to,
  });

  const activePreset = useMemo(() => matchPreset(value), [value]);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  function applyPreset(preset: DateRangePreset) {
    const range = preset.getRange();
    onChange(range);
    setDraft({ from: range.from, to: range.to });
    setOpen(false);
  }

  function applyDraft() {
    if (!draft?.from) return;
    const to = draft.to ?? draft.from;
    onChange({ from: startOfDay(draft.from), to: endOfDay(to) });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft({ from: value.from, to: value.to });
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 font-mono text-xs">
          <CalendarIcon className="size-3.5" />
          {formatRangeLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-col sm:flex-row">
          <div className="flex shrink-0 flex-col gap-1 border-b border-border p-2 sm:border-b-0 sm:border-r">
            {PRESETS.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                variant={activePreset === preset.key ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={draft}
              onSelect={setDraft}
              timeZone={timeZone}
              defaultMonth={value.from}
              className={cn("p-3")}
            />
            <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!draft?.from}
                onClick={applyDraft}
              >
                Terapkan
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { PRESETS as DATE_RANGE_PRESETS };
