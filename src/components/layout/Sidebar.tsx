import {
  BoxesIcon,
  ChartNoAxesCombinedIcon,
  GaugeIcon,
  KeyRoundIcon,
  Layers3Icon,
  LogOutIcon,
  type LucideIcon,
  MoonIcon,
  SlidersHorizontalIcon,
  SunIcon,
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
import { apiClient } from "@/lib/api-client";

export type AppModule =
  | "providers"
  | "combos"
  | "usage"
  | "quota"
  | "token-saver"
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
  const found = appModules.find((m) => m.path === pathname);
  return found?.id ?? "providers";
}

export const defaultPath = appModules[0].path;

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
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get<{ theme: "light" | "dark" }>("/api/settings/theme", {
        signal: controller.signal,
      })
      .then((data) => {
        const dark = data.theme === "dark";
        setIsDark(dark);
        document.documentElement.classList.toggle("dark", dark);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const toggleTheme = useCallback(async () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      await apiClient.patch<{ ok: true }>("/api/settings/theme", {
        theme: next ? "dark" : "light",
      });
    } catch {
      setIsDark(!next);
      document.documentElement.classList.toggle("dark", !next);
    }
  }, [isDark]);

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
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary">
                  <Logo
                    gradient={false}
                    className="size-4 text-[#6D5CFB] dark:text-white"
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
            <SidebarMenuButton tooltip="Ganti tema" onClick={toggleTheme}>
              {isDark ? <SunIcon /> : <MoonIcon />}
              <span>{isDark ? "Mode Terang" : "Mode Gelap"}</span>
            </SidebarMenuButton>
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
