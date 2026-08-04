import {
  BoxesIcon,
  ChartNoAxesCombinedIcon,
  GaugeIcon,
  KeyRoundIcon,
  Layers3Icon,
  LogOutIcon,
  type LucideIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/icons/Logo";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarPrimitive,
  useSidebar,
} from "@/components/ui/sidebar";

export type AppModule =
  | "providers"
  | "combos"
  | "usage"
  | "quota"
  | "token-saver"
  | "settings";

type ModuleDefinition = {
  id: AppModule;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const appModules: [ModuleDefinition, ...ModuleDefinition[]] = [
  {
    id: "providers",
    label: "Providers",
    description: "Kelola provider dan akun upstream.",
    icon: BoxesIcon,
  },
  {
    id: "combos",
    label: "Combos",
    description: "Atur target fallback dan round-robin.",
    icon: Layers3Icon,
  },
  {
    id: "usage",
    label: "Usage",
    description: "Pantau penggunaan token dan biaya.",
    icon: ChartNoAxesCombinedIcon,
  },
  {
    id: "quota",
    label: "Quota Tracker",
    description: "Lihat sisa kuota setiap akun.",
    icon: GaugeIcon,
  },
  {
    id: "token-saver",
    label: "Token Saver",
    description: "Kelola kompresi output tool.",
    icon: SlidersHorizontalIcon,
  },
  {
    id: "settings",
    label: "Settings",
    description: "Atur akses dan preferensi aplikasi.",
    icon: KeyRoundIcon,
  },
];

interface AppSidebarProps {
  activeModule: AppModule;
  onModuleChange: (module: AppModule) => void;
  onLogout: () => Promise<void>;
}

export function AppSidebar({
  activeModule,
  onModuleChange,
  onLogout,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  function selectModule(module: AppModule) {
    onModuleChange(module);
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

  return (
    <SidebarPrimitive collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => selectModule("providers")}
            >
              <Logo className="size-6 shrink-0" />
              <span>KCG Router</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {appModules.map((module) => {
                const Icon = module.icon;
                return (
                  <SidebarMenuItem key={module.id}>
                    <SidebarMenuButton
                      isActive={activeModule === module.id}
                      tooltip={module.label}
                      onClick={() => selectModule(module.id)}
                    >
                      <Icon />
                      <span>{module.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
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
