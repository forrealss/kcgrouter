import {
  BoxesIcon,
  ChartNoAxesCombinedIcon,
  GaugeIcon,
  KeyRoundIcon,
  Layers3Icon,
  LayoutDashboardIcon,
  LogOutIcon,
  type LucideIcon,
  ScrollTextIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/icons/Logo";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
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
  | "logs"
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
    description: "System summary and analytics.",
    icon: LayoutDashboardIcon,
  },
  {
    id: "providers",
    path: "/providers",
    label: "Providers",
    description: "Manage providers and upstream accounts.",
    icon: BoxesIcon,
  },
  {
    id: "combos",
    path: "/combos",
    label: "Combos",
    description: "Configure fallback and round-robin targets.",
    icon: Layers3Icon,
  },
  {
    id: "usage",
    path: "/usage",
    label: "Usage",
    description: "Monitor token usage and costs.",
    icon: ChartNoAxesCombinedIcon,
  },
  {
    id: "quota",
    path: "/quota",
    label: "Quota Tracker",
    description: "View remaining quota per account.",
    icon: GaugeIcon,
  },
  {
    id: "token-saver",
    path: "/token-saver",
    label: "Token Saver",
    description: "Manage tool output compression.",
    icon: SlidersHorizontalIcon,
  },
  {
    id: "cli-tools",
    path: "/cli-tools",
    label: "CLI Tools",
    description: "Configure CLI tools to connect to KCG Router.",
    icon: TerminalIcon,
  },
];

const secondaryModules: [ModuleDefinition, ...ModuleDefinition[]] = [
  {
    id: "logs",
    path: "/logs",
    label: "Logs",
    description: "View request, error, and admin activity logs.",
    icon: ScrollTextIcon,
  },
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    description: "Manage application access and preferences.",
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
              <span className="group-data-[collapsible=icon]:hidden">
                {module.label}
              </span>
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
              <a
                href={defaultPath}
                onClick={(e) => handleNav(defaultPath, e)}
                aria-label="KCG Router dashboard"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary dark:shadow-[0_0_18px_-6px] dark:shadow-primary">
                  <Logo gradient={false} className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
                    KCG Router
                  </span>
                  <span className="flex items-center gap-1.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
                    <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70" />
                    gateway online
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="gap-1">
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/40">
            Operations
          </SidebarGroupLabel>
          <SidebarMenu>{renderModuleItems(mainModules)}</SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup className="gap-1">
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/40">
            Observability / system
          </SidebarGroupLabel>
          <SidebarMenu>{renderModuleItems(secondaryModules)}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between gap-2 rounded-md border border-sidebar-border/70 bg-sidebar-accent/20 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/60">
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px] shadow-primary/60" />
                Theme
              </span>
              <ThemePicker
                size="sm"
                value={theme}
                onChange={(nextTheme) => void changeTheme(nextTheme)}
                disabled={theme === null || isSavingTheme}
              />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="mb-1 flex items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
              <span className="size-1.5 rounded-full bg-emerald-500/80" />
              session / local
            </div>
            <SidebarMenuButton
              tooltip="Log out"
              className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
              disabled={isLoggingOut}
              onClick={handleLogout}
            >
              <LogOutIcon />
              <span className="group-data-[collapsible=icon]:hidden">
                {isLoggingOut ? "Logging out..." : "Log out"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarPrimitive>
  );
}
