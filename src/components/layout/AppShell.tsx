import { AlertCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  type AppModule,
  AppSidebar,
  appModules,
  defaultPath,
  resolveModuleFromPath,
} from "@/components/layout/Sidebar";
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
import { useRouter } from "@/hooks/useRouter";
import { getApiErrorMessage } from "@/lib/api-client";
import { CombosPage } from "@/pages/combos/CombosPage";
import { ProviderDetailPage } from "@/pages/providers/ProviderDetailPage";
import { ProvidersPage } from "@/pages/providers/ProvidersPage";
import { QuotaPage } from "@/pages/quota/QuotaPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { TokenSaverPage } from "@/pages/token-saver/TokenSaverPage";
import { UsagePage } from "@/pages/usage/UsagePage";

interface AppShellProps {
  onLogout: () => Promise<void>;
  renderModule?: (module: AppModule) => ReactNode;
}

export function AppShell({ onLogout, renderModule }: AppShellProps) {
  const { pathname, navigate } = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const activeModule = resolveModuleFromPath(pathname);
  const currentModule =
    appModules.find((module) => module.id === activeModule) ?? appModules[0];

  // Check for provider detail route: /providers/:id
  const providerDetailMatch = pathname.match(/^\/providers\/([^/]+)$/);
  const providerDetailId = providerDetailMatch?.[1] ?? null;

  if (pathname === "/") {
    navigate(defaultPath);
  }

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
        onNavigate={navigate}
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
          ) : activeModule === "providers" && providerDetailId ? (
            <ProviderDetailPage providerId={providerDetailId} />
          ) : activeModule === "providers" ? (
            <ProvidersPage />
          ) : activeModule === "combos" ? (
            <CombosPage />
          ) : activeModule === "usage" ? (
            <UsagePage />
          ) : activeModule === "quota" ? (
            <QuotaPage />
          ) : activeModule === "token-saver" ? (
            <TokenSaverPage />
          ) : activeModule === "settings" ? (
            <SettingsPage />
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
