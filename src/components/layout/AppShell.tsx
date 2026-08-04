import { AlertCircleIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ComboList } from "@/components/combos/ComboList";
import {
  type AppModule,
  AppSidebar,
  appModules,
} from "@/components/layout/Sidebar";
import { ProviderList } from "@/components/providers/ProviderList";
import { QuotaGrid } from "@/components/quota/QuotaGrid";
import { ApiKeyManager } from "@/components/settings/ApiKeyManager";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { TokenSaverPanel } from "@/components/token-saver/TokenSaverPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { UsageOverview } from "@/components/usage/UsageOverview";
import { getApiErrorMessage } from "@/lib/api-client";

interface AppShellProps {
  onLogout: () => Promise<void>;
  renderModule?: (module: AppModule) => ReactNode;
}

export function AppShell({ onLogout, renderModule }: AppShellProps) {
  const [activeModule, setActiveModule] = useState<AppModule>("providers");
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const currentModule =
    appModules.find((module) => module.id === activeModule) ?? appModules[0];

  async function handleLogout() {
    setLogoutError(null);
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(getApiErrorMessage(error));
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        onLogout={handleLogout}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
          <SidebarTrigger />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {currentModule.label}
            </h1>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          {logoutError ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Gagal keluar</AlertTitle>
              <AlertDescription>{logoutError}</AlertDescription>
            </Alert>
          ) : null}
          {renderModule ? (
            renderModule(activeModule)
          ) : activeModule === "providers" ? (
            <ProviderList />
          ) : activeModule === "combos" ? (
            <ComboList />
          ) : activeModule === "usage" ? (
            <UsageOverview />
          ) : activeModule === "quota" ? (
            <QuotaGrid />
          ) : activeModule === "token-saver" ? (
            <TokenSaverPanel />
          ) : activeModule === "settings" ? (
            <section className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Settings
                </h2>
                <p className="text-muted-foreground">
                  Kelola keamanan dashboard, preferensi tampilan, dan akses
                  router.
                </p>
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <ChangePasswordForm />
                <ThemeToggle />
              </div>
              <ApiKeyManager />
            </section>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{currentModule.label}</CardTitle>
                <CardDescription>{currentModule.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Modul ini siap dihubungkan dengan antarmuka pengelolaannya.
              </CardContent>
            </Card>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
