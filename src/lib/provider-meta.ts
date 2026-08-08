import {
  BotIcon,
  BrainCircuitIcon,
  CpuIcon,
  type LucideIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";
import type { ProviderTransport } from "@/types/provider";

export interface TransportMeta {
  label: string;
  icon?: string;
  fallbackIcon: LucideIcon;
  accentClassName: string;
}

export const transportMeta: Record<ProviderTransport, TransportMeta> = {
  openai: {
    label: "OpenAI-compatible",
    icon: "/images/providers/openai.svg",
    fallbackIcon: BotIcon,
    accentClassName: "border-chart-3/40 bg-chart-3/10 text-chart-3",
  },
  anthropic: {
    label: "Anthropic",
    icon: "/images/providers/anthropic.svg",
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
    fallbackIcon: TerminalIcon,
    accentClassName:
      "border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground",
  },
  mimo: {
    label: "Xiaomi MiMo",
    icon: "/images/providers/xiaomimimo.svg",
    fallbackIcon: BotIcon,
    accentClassName: "border-chart-1/40 bg-chart-1/10 text-chart-1",
  },
};
