import { ApiKeyManager } from "@/components/settings/ApiKeyManager";
import { PreferencesCard } from "@/components/settings/PreferencesCard";

export function SettingsPage() {
  return (
    <section className="flex flex-col gap-5 pb-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage dashboard preferences and API access.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:items-start">
        <PreferencesCard />
        <ApiKeyManager />
      </div>
    </section>
  );
}
