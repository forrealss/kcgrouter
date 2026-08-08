import { ApiKeyManager } from "@/components/settings/ApiKeyManager";
import { PreferencesCard } from "@/components/settings/PreferencesCard";

export function SettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Pengaturan</h2>
        <p className="text-sm text-muted-foreground">
          Kelola keamanan dashboard, preferensi tampilan, dan akses router.
        </p>
      </div>
      <PreferencesCard />
      <ApiKeyManager />
    </section>
  );
}
