import { run } from "../client";

export function seed(): void {
  run(
    `INSERT OR IGNORE INTO providers (id, name, transport, base_url, is_builtin, prefix, created_at)
     VALUES
       ('builtin-openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', 1, 'openai', datetime('now')),
       ('builtin-anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com', 1, 'anthropic', datetime('now')),
       ('builtin-gemini', 'Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com', 1, 'gemini', datetime('now')),
       ('builtin-kiro', 'Kiro AI', 'kiro', 'https://codewhisperer.us-east-1.amazonaws.com', 1, 'kiro', datetime('now')),
       ('builtin-command-code', 'Command Code', 'command-code', 'https://api.commandcode.ai', 1, 'command-code', datetime('now'))`,
  );
}
