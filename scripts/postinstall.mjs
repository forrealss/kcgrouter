// Cross-platform postinstall: prepares systray2's native tray binaries.
// On Unix it makes them executable and creates the platform symlinks that
// systray2 looks for in debug mode. On Windows (where `chmod`/`ln` are not
// available in bun's shell) it copies the binary instead of symlinking,
// because creating symlinks requires admin privileges / Developer Mode.
import { chmodSync, copyFileSync, existsSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Locate systray2's traybin directory by walking up from the package root.
 * systray2 may be nested (`node_modules/systray2`) for local installs or
 * hoisted (a sibling of the package) for `bun i -g` / `npm i -g` global
 * installs. Walking the `node_modules` dirs explicitly (instead of using
 * require.resolve) keeps this deterministic: bun's resolver can fall back to
 * its global install cache, which would make the postinstall patch a cached
 * copy instead of the actual installation.
 */
function resolveTraybin() {
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, "node_modules", "systray2", "traybin");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const target = {
  linux: { src: "tray_linux_release", link: "tray_linux" },
  darwin: { src: "tray_darwin_release", link: "tray_darwin" },
  win32: { src: "tray_windows_release.exe", link: "tray_windows.exe" },
}[process.platform];

if (!target) {
  process.exit(0);
}

const traybin = resolveTraybin();
if (!traybin) {
  console.log("[postinstall] systray2 traybin not found, skipping");
  process.exit(0);
}

const srcPath = join(traybin, target.src);
const linkPath = join(traybin, target.link);

if (!existsSync(srcPath)) {
  console.log("[postinstall] systray2 traybin not found, skipping");
  process.exit(0);
}

// Make binaries executable on Unix.
if (process.platform !== "win32") {
  for (const name of [
    "tray_linux_release",
    "tray_darwin_release",
    target.src,
  ]) {
    try {
      chmodSync(join(traybin, name), 0o755);
    } catch {}
  }
}

if (existsSync(linkPath)) {
  process.exit(0);
}

try {
  symlinkSync(srcPath, linkPath);
} catch {
  // Windows without Developer Mode: fall back to a plain copy.
  try {
    copyFileSync(srcPath, linkPath);
  } catch {
    console.log("[postinstall] could not link tray binary");
  }
}
