import { ApiKeyManager } from "@/components/settings/ApiKeyManager";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { ThemeToggle } from "@/components/settings/ThemeToggle";

export function SettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Pengaturan</h2>
        <p className="text-sm text-muted-foreground">
          Kelola keamanan dashboard, preferensi tampilan, dan akses router.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <ChangePasswordForm />
        <ThemeToggle />
      </div>
      <ApiKeyManager />
    </section>
  );
}
