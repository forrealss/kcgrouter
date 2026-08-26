"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "data-[state=unchecked]:border-border data-[state=unchecked]:bg-muted-foreground/25 data-[state=unchecked]:shadow-[inset_0_1px_2px_oklch(0_0_0_/_8%)]",
        "dark:data-[state=unchecked]:bg-input/60 dark:data-[state=unchecked]:shadow-none",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
          "translate-x-[2px] data-[state=checked]:translate-x-[calc(100%+2px)]",
          "dark:bg-foreground dark:ring-0 dark:data-[state=checked]:bg-primary-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
