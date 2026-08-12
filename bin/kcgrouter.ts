#!/usr/bin/env bun

import { dirname } from "node:path";
import { runCli } from "../src/cli/index";
import { ensureSecrets } from "../src/env";
import { setProcessName } from "../src/lib/process-name";

// Show up as "kcgrouter" (not "bun") in process managers.
setProcessName("kcgrouter");

// Package root = parent of bin/.
const packageRoot = dirname(import.meta.dir);

// Make sure secrets exist before any daemon is spawned (so the spawned
// server inherits them) or any encryption happens.
ensureSecrets();

await runCli(packageRoot);
