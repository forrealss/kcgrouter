import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type SysTray from "systray2";
import { isRunning, stopDaemon } from "./daemon";
import { openBrowser } from "./menu";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface MenuItem {
  title: string;
  enabled: boolean;
}

export interface TrayOptions {
  port: number;
  onQuit: () => void;
}

export interface TrayInstance {
  update(items: MenuItem[]): void;
  setTooltip(text: string): void;
  destroy(): void;
}

// Minimal 16x16 KCG Router icon as base64 PNG (fallback)
const FALLBACK_ICON_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAALEwAACxMBAJqcGAAAAHpJREFUOE9jYBgFgwEwMjIy/Gdg+P8fyP4PxP8ZGBgEcBnGyMjIsICBgSEAhyH/gfgBUNN8XJoZsdkCVL8Ah+b/QPwbqvkBMvk/AwMDAzYX/GdgYAhAN+A/SICRWAMYGfFEJSMjzriEiwDR/xmIa2RkZCSqnZERb3QCAAo3KxzxbKe1AAAAAElFTkSuQmCC";

export function getIconPath(): string {
  // systray2 requires .ico on Windows and PNG on macOS/Linux.
  const candidates =
    process.platform === "win32"
      ? ["icon.ico", "icon.png"]
      : ["icon.png", "icon.ico"];
  for (const iconFile of candidates) {
    // Try assets folder first, then current dir
    const paths = [
      join(__dirname, "..", "..", "assets", iconFile),
      join(__dirname, "..", iconFile),
      join(__dirname, iconFile),
    ];
    for (const iconPath of paths) {
      if (existsSync(iconPath)) return iconPath;
    }
  }
  return "";
}

export function getIconBase64(): string {
  const iconPath = getIconPath();
  if (iconPath) {
    try {
      return readFileSync(iconPath).toString("base64");
    } catch {
      // fall through to default
    }
  }
  return FALLBACK_ICON_BASE64;
}

export function isTraySupported(): boolean {
  const p = process.platform;
  if (!["darwin", "win32", "linux"].includes(p)) return false;
  if (p === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
    return false;
  return true;
}

export function buildMenuItems(args: {
  port: number;
  running: boolean;
}): MenuItem[] {
  return [
    { title: "Open Dashboard", enabled: true },
    { title: `Port: ${args.port}`, enabled: false },
    { title: args.running ? "Stop Server" : "Start Server", enabled: true },
    { title: "Quit KCG Router", enabled: true },
  ];
}

const MENU_INDEX = {
  OPEN_DASHBOARD: 0,
  PORT: 1,
  TOGGLE_SERVER: 2,
  QUIT: 3,
} as const;

export async function initTray(
  options: TrayOptions,
): Promise<TrayInstance | null> {
  if (!isTraySupported()) {
    console.log("[tray] Not supported on this platform/display");
    return null;
  }

  try {
    // Lazy load systray2
    const SysTray = await loadSystray();
    if (!SysTray) return null;

    let running = isRunning();
    const menuItems = buildMenuItems({ port: options.port, running });

    const systray = new SysTray({
      menu: {
        icon: getIconBase64(),
        isTemplateIcon: false,
        title: "KCG Router",
        tooltip: `KCG Router :${options.port}`,
        items: menuItems.map((it) => ({
          title: it.title,
          tooltip: "",
          checked: false,
          enabled: it.enabled,
        })),
      },
      debug: false,
      copyDir: false,
    });

    systray.onClick(async (action: { seq_id: number }) => {
      switch (action.seq_id) {
        case MENU_INDEX.OPEN_DASHBOARD:
          openBrowser(String(options.port));
          break;
        case MENU_INDEX.TOGGLE_SERVER: {
          if (running) {
            stopDaemon();
            running = false;
          } else {
            // Start server - need packageRoot
            const { spawnDaemon } = await import("./daemon");
            spawnDaemon(join(__dirname, "..", ".."));
            running = true;
          }
          // Update menu item
          systray.sendAction({
            type: "update-item",
            item: {
              title: running ? "Stop Server" : "Start Server",
              enabled: true,
              checked: false,
              tooltip: "",
            },
            seq_id: MENU_INDEX.TOGGLE_SERVER,
          });
          break;
        }
        case MENU_INDEX.QUIT:
          options.onQuit();
          break;
      }
    });

    return {
      update: (items) => {
        items.forEach((it, idx) => {
          systray.sendAction({
            type: "update-item",
            item: {
              title: it.title,
              enabled: it.enabled,
              checked: false,
              tooltip: "",
            },
            seq_id: idx,
          });
        });
      },
      setTooltip: () => {
        /* systray2 does not support runtime tooltip change */
      },
      destroy: () => systray.kill(false),
    };
  } catch (err) {
    console.error("[tray] Failed to initialize:", err);
    return null;
  }
}

async function loadSystray(): Promise<typeof SysTray | null> {
  try {
    // Try to load systray2 - it needs to be installed
    const mod = await import("systray2");
    return mod.default;
  } catch {
    console.log(
      "[tray] systray2 not installed. Install with: bun add systray2",
    );
    return null;
  }
}
