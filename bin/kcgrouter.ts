#!/usr/bin/env bun

import { spawn } from "bun";
import { dirname } from "node:path";

// Package root = parent of bin/. Spawn the server with cwd set here so Bun
// reads bunfig.toml (which registers bun-plugin-tailwind for CSS bundling).
// Without the correct cwd, Tailwind CSS is served uncompiled (raw @theme).
const packageRoot = dirname(import.meta.dir);

const child = spawn(["bun", "src/index.ts"], {
  cwd: packageRoot,
  stdio: ["inherit", "inherit", "inherit"],
  env: process.env,
});

// Forward termination signals so Ctrl+C / kill stops the child too.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => child.kill());
}

process.exit(await child.exited);
