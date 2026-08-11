import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: {
  value: Theme;
  label: string;
  icon: typeof SunIcon;
}[] = [
  { value: "light", label: "Light theme", icon: SunIcon },
  { value: "system", label: "Follow device", icon: MonitorIcon },
  { value: "dark", label: "Dark theme", icon: MoonIcon },
];

interface ThemePickerProps {
  value: Theme | null;
  onChange: (theme: Theme) => void;
  disabled?: boolean;
  /** "sm" for compact areas such as the sidebar. */
  size?: "default" | "sm";
  className?: string;
}

export function ThemePicker({
  value,
  onChange,
  disabled = false,
  size = "default",
  className,
}: ThemePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Select theme"
      className={cn(
        "flex items-center gap-1 rounded-lg border bg-muted/40 p-1",
        className,
      )}
    >
      {THEME_OPTIONS.map(({ value: optionValue, label, icon: Icon }) => {
        const isSelected = value === optionValue;
        return (
          <Button
            key={optionValue}
            type="button"
            variant="ghost"
            size={size === "sm" ? "icon-xs" : "icon-sm"}
            role="radio"
            aria-checked={isSelected}
            title={label}
            disabled={disabled}
            onClick={() => onChange(optionValue)}
            className={cn(
              "rounded-md",
              isSelected
                ? "bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground"
                : "text-muted-foreground",
            )}
          >
            <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
          </Button>
        );
      })}
    </div>
  );
}
