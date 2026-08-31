/**
 * Registry of all CLI tools. Import new tools here and add to the array.
 */

import { claudeTool } from "./claude";
import { coworkTool } from "./cowork";
import { opencodeTool } from "./opencode";
import { piTool } from "./pi";
import type { CLIToolDefinition } from "./registry";

export const cliTools: CLIToolDefinition[] = [
  claudeTool,
  coworkTool,
  opencodeTool,
  piTool,
];

export function getTool(id: string): CLIToolDefinition | undefined {
  return cliTools.find((t) => t.id === id);
}

export function getAllToolStatuses(): Record<
  string,
  {
    name: string;
    icon: string;
    darkIcon?: string;
    description: string;
    installed: boolean;
    configured: boolean;
  }
> {
  const result: Record<string, unknown> = {};
  for (const tool of cliTools) {
    const status = tool.read();
    result[tool.id] = {
      name: tool.name,
      icon: tool.icon,
      darkIcon: tool.darkIcon,
      description: tool.description,
      installed: status.installed,
      configured: status.configured,
    };
  }
  return result as Record<
    string,
    {
      name: string;
      icon: string;
      darkIcon?: string;
      description: string;
      installed: boolean;
      configured: boolean;
    }
  >;
}
