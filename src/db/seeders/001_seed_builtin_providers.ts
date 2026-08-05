import { run } from "../client";

export function seed(): void {
  run(
    `INSERT OR IGNORE INTO providers (id, name, transport, base_url, is_builtin, prefix, created_at)
     VALUES
       ('builtin-kiro', 'Kiro AI', 'kiro', 'https://codewhisperer.us-east-1.amazonaws.com', 1, 'kiro', datetime('now')),
       ('builtin-command-code', 'Command Code', 'command-code', 'https://api.commandcode.ai', 1, 'command-code', datetime('now'))`,
  );
}
