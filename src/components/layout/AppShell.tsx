import { AlertCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { GatewayStatus } from "@/components/layout/GatewayStatus";
import {
  type AppModule,
  AppSidebar,
  appModules,
  defaultPath,
  resolveModuleFromPath,
} from "@/components/layout/Sidebar";
import { UpdateBadge } from "@/components/layout/UpdateBadge";
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
import { Toaster } from "@/components/ui/sonner";
import { useRouter } from "@/hooks/useRouter";
import { getApiErrorMessage } from "@/lib/api-client";
import { CLIToolDetailPage } from "@/pages/cli-tools/CLIToolDetailPage";
import { CLIToolsListPage } from "@/pages/cli-tools/CLIToolsListPage";
import { CombosPage } from "@/pages/combos/CombosPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { LogsPage } from "@/pages/logs/LogsPage";
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

  // Check for CLI tool detail route: /cli-tools/:toolId
  const cliToolDetailMatch = pathname.match(/^\/cli-tools\/([^/]+)$/);
  const cliToolDetailId = cliToolDetailMatch?.[1] ?? null;

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
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl md:px-6">
          <SidebarTrigger className="text-muted-foreground hover:bg-accent hover:text-foreground" />
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight">
              {currentModule.label}
            </h1>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              {currentModule.description}
            </p>
          </div>
          <UpdateBadge />
          <GatewayStatus />
        </header>
        <main
          className={`mx-auto flex min-h-0 w-full max-w-[1700px] flex-1 flex-col gap-6 overscroll-contain overflow-x-hidden overflow-y-auto scrollbar-subtle p-4 md:p-6 ${activeModule === "dashboard" ? "bg-grid" : ""}`}
        >
          {logoutError ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Logout failed</AlertTitle>
              <AlertDescription>{logoutError}</AlertDescription>
            </Alert>
          ) : null}
          {renderModule ? (
            renderModule(activeModule)
          ) : activeModule === "dashboard" ? (
            <DashboardPage />
          ) : activeModule === "providers" && providerDetailId ? (
            <ProviderDetailPage providerId={providerDetailId} />
          ) : activeModule === "providers" ? (
            <ProvidersPage />
          ) : activeModule === "combos" ? (
            <CombosPage />
          ) : activeModule === "usage" ? (
            <UsagePage />
          ) : activeModule === "logs" ? (
            <LogsPage />
          ) : activeModule === "quota" ? (
            <QuotaPage />
          ) : activeModule === "token-saver" ? (
            <TokenSaverPage />
          ) : activeModule === "cli-tools" && cliToolDetailId ? (
            <CLIToolDetailPage toolId={cliToolDetailId} />
          ) : activeModule === "cli-tools" ? (
            <CLIToolsListPage />
          ) : activeModule === "settings" ? (
            <SettingsPage />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{currentModule.label}</CardTitle>
                <CardDescription>{currentModule.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                This module is ready to be connected to its management
                interface.
              </CardContent>
            </Card>
          )}
        </main>
      </SidebarInset>
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}
