// Shared ANSI / TUI helpers for the CLI screens (cat prompt, main menu).

export const RESET = "\x1b[0m";
export const DIM = "\x1b[2m";
export const GRAY = "\x1b[90m";
export const RED = "\x1b[38;2;255;110;110m";
export const GREEN = "\x1b[38;2;120;230;150m";
export const CYAN = "\x1b[38;2;120;225;255m";
export const WHITE = "\x1b[38;2;240;245;255m";

// 24-bit color palette
export const ORANGE = "\x1b[38;2;242;163;60m"; // ginger fur
export const ORANGE_DARK = "\x1b[38;2;196;116;36m"; // ginger stripes
export const PINK = "\x1b[38;2;255;150;180m"; // inner ear / nose / tail
export const EYE = "\x1b[38;2;120;225;255m"; // glowing cyan eyes
export const BORDER_1 = "\x1b[38;2;90;200;255m"; // cyan frame
export const BORDER_2 = "\x1b[38;2;120;140;255m"; // periwinkle frame (pulse)
export const HIGHLIGHT_BG = "\x1b[48;2;38;82;160m"; // selected-row background

export const CURSOR_HIDE = "\x1b[?25l";
export const CURSOR_SHOW = "\x1b[?25h";
export const CLEAR_SCREEN = "\x1b[2J";
export const CLEAR_LINE = "\x1b[2K";
export const MOVE_TO = (row: number) => `\x1b[${row};1H`;

export const TITLE_GRADIENT: [
  [number, number, number],
  [number, number, number],
] = [
  [255, 150, 60], // warm orange
  [255, 95, 190], // magenta
];

/** Display width of a string, ignoring ANSI escape sequences. */
export function visibleWidth(s: string): number {
  // Split on ESC and strip the leading "[code m" from each segment. Avoids a
  // control-character regex literal (biome: noControlCharactersInRegex).
  return s
    .split("\x1b")
    .map((seg) => seg.replace(/^\[[0-9;]*m/, ""))
    .join("").length;
}

/** Per-character truecolor gradient text. */
export function gradientText(
  text: string,
  from: [number, number, number],
  to: [number, number, number],
): string {
  const n = text.length;
  let out = "";
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 1 : i / (n - 1);
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    out += `\x1b[38;2;${r};${g};${b}m${text[i]}${RESET}`;
  }
  return out;
}

/** Rounded-corner box with a fixed or content-sized inner width. */
export function boxLines(
  content: string[],
  border: string,
  fixedInner?: number,
): string[] {
  const inner =
    fixedInner ?? Math.max(0, ...content.map((l) => visibleWidth(l)));
  const width = inner + 2;
  return [
    `${border}╭${"─".repeat(width)}╮${RESET}`,
    ...content.map(
      (l) =>
        `${border}│${RESET} ${l}${" ".repeat(Math.max(0, inner - visibleWidth(l)))} ${border}│${RESET}`,
    ),
    `${border}╰${"─".repeat(width)}╯${RESET}`,
  ];
}
