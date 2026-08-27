import { ApiKeyManager } from "@/components/settings/ApiKeyManager";
import { EncryptionMismatchAlert } from "@/components/settings/EncryptionMismatchAlert";
import { PreferencesCard } from "@/components/settings/PreferencesCard";

export function SettingsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-5 pb-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Dashboard sign-in, appearance, and the API keys clients use to reach
          the router.
        </p>
      </header>

      <EncryptionMismatchAlert />

      <div className="grid min-w-0 gap-4 xl:grid-cols-5 xl:items-start">
        <div className="min-w-0 xl:col-span-2">
          <PreferencesCard />
        </div>
        <div
          id="api-keys"
          className="min-w-0 scroll-mt-20 rounded-xl transition-shadow xl:col-span-3"
        >
          <ApiKeyManager />
        </div>
      </div>
    </div>
  );
}
