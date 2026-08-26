import {
  KeyRoundIcon,
  LockKeyholeIcon,
  MonitorCogIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { ApiKeyManager } from "@/components/settings/ApiKeyManager";
import { EncryptionMismatchAlert } from "@/components/settings/EncryptionMismatchAlert";
import { PreferencesCard } from "@/components/settings/PreferencesCard";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const systemMetrics = [
  {
    label: "Session",
    value: "PASSWORD",
    icon: LockKeyholeIcon,
    tone: "ok",
  },
  {
    label: "Storage",
    value: "SQLITE",
    icon: SlidersHorizontalIcon,
    tone: "primary",
  },
  {
    label: "API access",
    value: "KEYSTORE",
    icon: KeyRoundIcon,
    tone: "violet",
  },
  {
    label: "Theme",
    value: "SYSTEM",
    icon: MonitorCogIcon,
    tone: "amber",
  },
] as const;

const metricTone = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  primary: "border-primary/30 bg-primary/10 text-primary",
  violet: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  amber: "border-chart-4/30 bg-chart-4/10 text-chart-4",
} as const;

function StatusLed({ label }: { label: string }) {
  return (
    <span
      role="status"
      aria-label={`Settings ${label}`}
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-500"
    >
      <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70" />
      {label}
    </span>
  );
}

export function SettingsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 pb-4 scrollbar-subtle">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Control plane / configuration
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Session, appearance, and API keys.
          </p>
        </div>
        <StatusLed label="local" />
      </header>

      <EncryptionMismatchAlert />

      <Card className="!py-0 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4 [&>*]:bg-card">
          {systemMetrics.map(({ label, value, icon: Icon, tone }) => (
            <div
              key={label}
              className="flex min-w-0 items-center gap-3 px-3 py-3.5 sm:px-4"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md border",
                  metricTone[tone],
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {label}
                </p>
                <p className="glow-primary font-mono text-sm font-semibold tracking-tight">
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:items-start">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Account / preferences
            </p>
            <span className="font-mono text-[10px] text-muted-foreground">
              LOCAL
            </span>
          </div>
          <PreferencesCard />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Access / credentials
            </p>
            <span className="font-mono text-[10px] text-muted-foreground">
              KEYSTORE
            </span>
          </div>
          <ApiKeyManager />
        </div>
      </div>
    </div>
  );
}
