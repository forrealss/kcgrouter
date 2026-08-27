import {
  BotIcon,
  BrainCircuitIcon,
  CpuIcon,
  DropletsIcon,
  type LucideIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";
import type { ProviderTransport } from "@/types/provider";

export interface TransportMeta {
  label: string;
  icon?: string;
  darkIcon?: string;
  fallbackIcon: LucideIcon;
  accentClassName: string;
}

/**
 * Identity colour per transport. Each entry uses a distinct `--chart-*` hue so
 * accounts stay tellable apart in badges and topology views.
 *
 * `--chart-3` is deliberately absent: it mirrors `--live`, which is reserved for
 * in-flight traffic. A provider badge is identity, not activity.
 */
export const transportMeta: Record<ProviderTransport, TransportMeta> = {
  openai: {
    label: "OpenAI-compatible",
    icon: "/images/providers/openai.svg",
    darkIcon: "/images/providers/openai-dark.svg",
    fallbackIcon: BotIcon,
    accentClassName: "border-chart-1/40 bg-chart-1/10 text-chart-1",
  },
  anthropic: {
    label: "Anthropic",
    icon: "/images/providers/anthropic.svg",
    darkIcon: "/images/providers/anthropic-dark.svg",
    fallbackIcon: BrainCircuitIcon,
    accentClassName: "border-chart-4/40 bg-chart-4/10 text-chart-4",
  },
  gemini: {
    label: "Google Gemini",
    fallbackIcon: SparklesIcon,
    accentClassName: "border-chart-2/40 bg-chart-2/10 text-chart-2",
  },
  kiro: {
    label: "Kiro (AWS CodeWhisperer)",
    icon: "/images/providers/kiro.svg",
    fallbackIcon: CpuIcon,
    accentClassName: "border-chart-5/40 bg-chart-5/10 text-chart-5",
  },
  "command-code": {
    label: "Command Code",
    icon: "/images/providers/command-code.svg",
    darkIcon: "/images/providers/command-code-dark.svg",
    fallbackIcon: TerminalIcon,
    accentClassName:
      "border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground",
  },
  mimo: {
    label: "Xiaomi MiMo",
    icon: "/images/providers/xiaomimimo.svg",
    darkIcon: "/images/providers/xiaomimimo-dark.svg",
    fallbackIcon: BotIcon,
    accentClassName: "border-chart-7/40 bg-chart-7/10 text-chart-7",
  },
  qoder: {
    label: "Qoder",
    icon: "/images/providers/qoder.svg",
    darkIcon: "/images/providers/qoder-dark.webp",
    fallbackIcon: DropletsIcon,
    accentClassName: "border-chart-6/40 bg-chart-6/10 text-chart-6",
  },
};
