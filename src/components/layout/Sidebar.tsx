import {
  BoxesIcon,
  ChartNoAxesCombinedIcon,
  GaugeIcon,
  KeyRoundIcon,
  Layers3Icon,
  LayoutDashboardIcon,
  LogOutIcon,
  type LucideIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/icons/Logo";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarPrimitive,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemePicker } from "@/components/ui/theme-picker";
import { apiClient } from "@/lib/api-client";
import { applyTheme, onSystemThemeChange, type Theme } from "@/lib/theme";

export type AppModule =
  | "dashboard"
  | "providers"
  | "combos"
  | "usage"
  | "quota"
  | "token-saver"
  | "cli-tools"
  | "settings";

type ModuleDefinition = {
  id: AppModule;
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const mainModules: [ModuleDefinition, ...ModuleDefinition[]] = [
  {
    id: "dashboard",
    path: "/dashboard",
    label: "Dashboard",
    description: "Ringkasan sistem dan analitik.",
    icon: LayoutDashboardIcon,
  },
  {
    id: "providers",
    path: "/providers",
    label: "Providers",
    description: "Kelola provider dan akun upstream.",
    icon: BoxesIcon,
  },
  {
    id: "combos",
    path: "/combos",
    label: "Combos",
    description: "Atur target fallback dan round-robin.",
    icon: Layers3Icon,
  },
  {
    id: "usage",
    path: "/usage",
    label: "Usage",
    description: "Pantau penggunaan token dan biaya.",
    icon: ChartNoAxesCombinedIcon,
  },
  {
    id: "quota",
    path: "/quota",
    label: "Quota Tracker",
    description: "Lihat sisa kuota setiap akun.",
    icon: GaugeIcon,
  },
  {
    id: "token-saver",
    path: "/token-saver",
    label: "Token Saver",
    description: "Kelola kompresi output tool.",
    icon: SlidersHorizontalIcon,
  },
  {
    id: "cli-tools",
    path: "/cli-tools",
    label: "CLI Tools",
    description: "Konfigurasi CLI tools untuk terhubung ke KCG Router.",
    icon: TerminalIcon,
  },
];

const secondaryModules: [ModuleDefinition, ...ModuleDefinition[]] = [
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    description: "Atur akses dan preferensi aplikasi.",
    icon: KeyRoundIcon,
  },
];

export const appModules: [ModuleDefinition, ...ModuleDefinition[]] = [
  ...mainModules,
  ...secondaryModules,
];

export function resolveModuleFromPath(pathname: string): AppModule {
  if (/^\/providers\/[^/]+$/.test(pathname)) return "providers";
  if (/^\/cli-tools\/[^/]+$/.test(pathname)) return "cli-tools";
  const found = appModules.find((m) => m.path === pathname);
  return found?.id ?? "providers";
}

export const defaultPath = "/dashboard";

interface AppSidebarProps {
  activeModule: AppModule;
  onNavigate: (path: string) => void;
  onLogout: () => Promise<void>;
}

export function AppSidebar({
  activeModule,
  onNavigate,
  onLogout,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [isSavingTheme, setIsSavingTheme] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let stopWatching: (() => void) | undefined;
    apiClient
      .get<{ theme: Theme }>("/api/settings/theme", {
        signal: controller.signal,
      })
      .then((data) => {
        applyTheme(data.theme);
        setTheme(data.theme);
        if (data.theme === "system") {
          stopWatching = onSystemThemeChange(() => applyTheme("system"));
        }
      })
      .catch(() => {});
    return () => {
      controller.abort();
      stopWatching?.();
    };
  }, []);

  const changeTheme = useCallback(
    async (nextTheme: Theme) => {
      if (!theme || isSavingTheme || nextTheme === theme) return;

      const previousTheme = theme;
      setTheme(nextTheme);
      applyTheme(nextTheme);
      setIsSavingTheme(true);
      try {
        await apiClient.patch<{ ok: true }>("/api/settings/theme", {
          theme: nextTheme,
        });
      } catch {
        setTheme(previousTheme);
        applyTheme(previousTheme);
      } finally {
        setIsSavingTheme(false);
      }
    },
    [theme, isSavingTheme],
  );

  function handleNav(path: string, e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    onNavigate(path);
    if (isMobile) setOpenMobile(false);
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  function renderModuleItems(modules: ModuleDefinition[]) {
    return modules.map((module) => {
      const Icon = module.icon;
      return (
        <SidebarMenuItem key={module.id}>
          <SidebarMenuButton
            isActive={activeModule === module.id}
            tooltip={module.label}
            asChild
          >
            <a href={module.path} onClick={(e) => handleNav(module.path, e)}>
              <Icon />
              <span>{module.label}</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });
  }

  return (
    <SidebarPrimitive variant="floating" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href={defaultPath} onClick={(e) => handleNav(defaultPath, e)}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg ">
                  <Logo
                    gradient={false}
                    className="size-6 text-slate-700 dark:text-white"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">KCG Router</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>{renderModuleItems(mainModules)}</SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarMenu>{renderModuleItems(secondaryModules)}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
              <span className="text-sm text-sidebar-foreground/80">Tema</span>
              <ThemePicker
                size="sm"
                value={theme}
                onChange={(nextTheme) => void changeTheme(nextTheme)}
                disabled={theme === null || isSavingTheme}
              />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Keluar"
              disabled={isLoggingOut}
              onClick={handleLogout}
            >
              <LogOutIcon />
              <span>{isLoggingOut ? "Keluar..." : "Keluar"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarPrimitive>
  );
}
