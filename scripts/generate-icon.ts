// Generates assets/icon.png and assets/icon.ico from the KCG Router logo
// (the same mark as src/components/icons/Logo.tsx, rasterized at fixed sizes).
//
// The system tray (systray2) requires a raster image: PNG on macOS/Linux and
// ICO on Windows. Run with: bun run generate-icon
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const BRAND = "#6D5CFB";

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 14 74 L 14 44 C 14 36 16 29 20 23 L 31 9 L 39 24 C 42.5 22.8 46.2 22 50 22 C 53.8 22 57.5 22.8 61 24 L 69 9 L 80 23 C 84 29 86 36 86 44 L 86 62 C 86 76 76 86 62 86 L 38 86 C 27 86 19 81 16 74" fill="none" stroke="${BRAND}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="14" cy="74" r="7" fill="${BRAND}"/>
  <circle cx="34" cy="52" r="6" fill="${BRAND}"/>
  <circle cx="66" cy="52" r="6" fill="${BRAND}"/>
  <circle cx="50" cy="86" r="7" fill="${BRAND}"/>
</svg>`;

function renderPng(size: number): Uint8Array {
  const svg = new Resvg(LOGO_SVG, { fitTo: { mode: "width", value: size } });
  return svg.render().asPng();
}

// Wrap PNG entries into a Windows .ico container (Vista+ supports PNG icons).
function buildIco(entries: { size: number; data: Uint8Array }[]): Uint8Array {
  const headerSize = 6 + 16 * entries.length;
  const totalSize =
    headerSize + entries.reduce((a, e) => a + e.data.byteLength, 0);
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, entries.length, true); // count

  let offset = headerSize;
  entries.forEach((entry, i) => {
    const off = 6 + i * 16;
    view.setUint8(off, entry.size); // width
    view.setUint8(off + 1, entry.size); // height
    view.setUint8(off + 2, 0); // color count
    view.setUint8(off + 3, 0); // reserved
    view.setUint16(off + 4, 1, true); // color planes
    view.setUint16(off + 6, 32, true); // bits per pixel
    view.setUint32(off + 8, entry.data.byteLength, true); // size in bytes
    view.setUint32(off + 12, offset, true); // offset
    out.set(entry.data, offset);
    offset += entry.data.byteLength;
  });

  return out;
}

const outDir = join(import.meta.dir, "..", "assets");
mkdirSync(outDir, { recursive: true });

const png16 = renderPng(16);
const png32 = renderPng(32);

await Bun.write(join(outDir, "icon.png"), png32);
await Bun.write(
  join(outDir, "icon.ico"),
  buildIco([
    { size: 16, data: png16 },
    { size: 32, data: png32 },
  ]),
);

console.log(
  `Generated assets/icon.png (${png32.byteLength} bytes) and assets/icon.ico (16px + 32px PNG entries)`,
);
