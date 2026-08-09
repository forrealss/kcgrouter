# KCG Router — Design Guidelines

> Control room, bukan dashboard SaaS.
> Infra tool, bukan consumer app.
> Signal > decoration.

---

## 1. Design Philosophy

KCG Router adalah AI proxy gateway yang dioperasikan oleh developer.
Setiap elemen UI harus terasa seperti bagian dari sebuah sistem infrastruktur —
presisi, dense, dan fungsional.

**Prinsip:**

1. **Instrument panel, bukan landing page.** User datang untuk memantau dan mengoperasikan, bukan untuk terkesan. Prioritaskan data density dan scannability.
2. **Monospace adalah bahasa pertama untuk data.** Angka, ID, status, log — semua pakai monospace. Sans-serif hanya untuk chrome UI (judul, label, deskripsi).
3. **Glow, bukan gradient.** Efek visual berasal dari cahaya (glow, pulse, LED), bukan dari fill berwarna-warni. Dark mode adalah canvas utama.
4. **Satu aesthetic risk per halaman.** Setiap halaman boleh punya satu elemen yang memorable (cat mascot, trace log, network graph) — sisanya disiplin dan tenang.
5. **Respek terhadap waktu user.** Animasi hanya untuk menyampaikan informasi (status berubah, data masuk, koneksi aktif), bukan untuk hiburan.

---

## 2. Color System

### 2.1 Base Tokens (OKLCH)

Semua warna didefinisikan via CSS custom properties dalam color space OKLCH.
Hue utama: **264 (indigo)**. Accent hue: **292 (violet)**.

#### Light Mode

| Token | OKLCH | Kegunaan |
|-------|-------|----------|
| `--background` | `oklch(0.99 0.003 264)` | Page background |
| `--foreground` | `oklch(0.2 0.03 264)` | Text utama |
| `--card` | `oklch(1 0 0)` | Card surface |
| `--primary` | `oklch(0.53 0.22 264)` | CTA, active states |
| `--muted` | `oklch(0.96 0.01 264)` | Subtle backgrounds |
| `--muted-foreground` | `oklch(0.5 0.03 264)` | Secondary text |
| `--border` | `oklch(0.91 0.012 264)` | Borders, dividers |
| `--destructive` | `oklch(0.58 0.22 25)` | Errors, critical |

#### Dark Mode

| Token | OKLCH | Kegunaan |
|-------|-------|----------|
| `--background` | `oklch(0.17 0.025 264)` | Page background |
| `--foreground` | `oklch(0.95 0.01 264)` | Text utama |
| `--card` | `oklch(0.22 0.025 264)` | Card surface |
| `--primary` | `oklch(0.68 0.19 264)` | CTA, active states |
| `--muted` | `oklch(0.26 0.025 264)` | Subtle backgrounds |
| `--muted-foreground` | `oklch(0.68 0.02 264)` | Secondary text |
| `--border` | `oklch(1 0 0 / 10%)` | Borders, dividers |
| `--destructive` | `oklch(0.7 0.19 22)` | Errors, critical |

### 2.2 Chart Palette (5 warna)

| Token | Hue | Identitas |
|-------|-----|-----------|
| `--chart-1` | 264 (indigo) | Primary / MiMo |
| `--chart-2` | 300 (violet) | Gemini |
| `--chart-3` | 190 (cyan) | OpenAI |
| `--chart-4` | 60 (amber) | Anthropic |
| `--chart-5` | 20 (red) | Kiro |

### 2.3 Transport Accent Colors

Setiap provider transport punya warna identik yang digunakan konsisten di badge,
border, dan indicator:

```ts
// src/lib/provider-meta.ts
openai:        "border-chart-3/40 bg-chart-3/10 text-chart-3"    // cyan
anthropic:     "border-chart-4/40 bg-chart-4/10 text-chart-4"    // amber
gemini:        "border-chart-2/40 bg-chart-2/10 text-chart-2"    // violet
kiro:          "border-chart-5/40 bg-chart-5/10 text-chart-5"    // red
command-code:  "border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground" // gray
mimo:          "border-chart-1/40 bg-chart-1/10 text-chart-1"    // indigo
qoder:         "border-pink-500/40 bg-pink-500/10 text-pink-500" // pink
```

### 2.4 Semantic / Status Colors

| Status | Color | Glow | Kegunaan |
|--------|-------|------|----------|
| OK / Active / Live | `emerald-500` | `shadow-emerald-500/70` | Provider aktif, request sukses |
| Warning / Limited | `amber-400` | — | Quota hampir habis |
| Error / Critical | `destructive` | `shadow-destructive/70` | Provider gagal, request error |
| Info / Reroute | `sky-400` | — | Fallback triggered |
| Inactive / Expired | `muted-foreground/50` | — | Provider nonaktif |

### 2.5 Aturan Warna

- Dark mode adalah mode utama. Light mode harus tetap usable tapi desain harus di-review pertama di dark mode.
- Glow effects hanya di dark mode. Di light mode, gunakan border atau shadow biasa.
- Hindari gradient besar. Gradient hanya untuk logo (`#6D5CFB → #4C3FD9`) dan network graph edges.
- Warna transport harus konsisten di seluruh app — badge, table rows, graph nodes, card accents.

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Penggunaan |
|------|------|------------|
| UI Chrome | `font-sans` (system stack) | Judul halaman, label tombol, deskripsi, navigasi |
| Data / Code | `font-mono` | Angka, ID, log, status text, metric values, table data |
| Numeric | `font-mono tabular-nums` | Semua angka yang perlu align kolom |

### 3.2 Type Scale

| Element | Class | Size |
|---------|-------|------|
| Page title | `text-xl font-semibold` | 20px |
| Section title | `text-base font-semibold` | 16px |
| Card title | `text-sm font-medium` | 14px |
| Body text | `text-sm` | 14px |
| Description | `text-sm text-muted-foreground` | 14px |
| Caption / Label | `text-xs` | 12px |
| Micro label | `text-[11px]` | 11px |
| Metric value | `font-mono font-semibold tracking-tight tabular-nums` | varies |
| Log entry | `font-mono text-[11px] leading-relaxed` | 11px |

### 3.3 Aturan Tipografi

- **Monospace untuk semua data yang user baca dan bandingkan:** angka, ID, status, timestamp, token count, latency, cost.
- **`tabular-nums` wajib** untuk angka di kolom tabel dan metric strip agar rapi.
- **Uppercase hanya untuk label sistem:** `FALLBACK`, `ROUND-ROBIN`, `LIVE`, `OK`, `ERR`. Jangan uppercase untuk judul atau deskripsi.
- **`tracking-tight`** pada angka besar (metric values) untuk density.
- Hindari font weight di atas `semibold` — `bold` dan `extrabold` tidak pernah digunakan.

---

## 4. Layout System

### 4.1 App Shell

```
┌─────────┬──────────────────────────────────────┐
│         │  Header (h-14, border-b)              │
│ Sidebar │  ┌────────────────────────────────┐   │
│ (fixed) │  │                                │   │
│         │  │  Main Content                  │   │
│ 14rem   │  │  max-w: 1700px                 │   │
│ / 3rem  │  │  p-4 md:p-6                    │   │
│         │  │  gap-6                         │   │
│         │  │                                │   │
│         │  └────────────────────────────────┘   │
└─────────┴──────────────────────────────────────┘
```

- Sidebar: `variant="floating"`, `collapsible="icon"`, keyboard `Ctrl+B`
- Mobile: sidebar jadi Sheet overlay (16rem)
- Content: `mx-auto w-full max-w-[1700px]`

### 4.2 Density Rules

- **Dashboard & Usage:** High density. Metric strip, table, graph di satu viewport tanpa scroll berlebih.
- **CRUD pages (Providers, Combos, Settings):** Medium density. Card grid dengan spacing yang cukup.
- **Detail pages:** Medium density. Info architecture yang jelas dengan section grouping.
- **Jangan pernah terasa kosong.** Jika konten sedikit, gunakan empty state yang informative, bukan whitespace besar.

### 4.3 Grid Patterns

| Pattern | Class | Kegunaan |
|---------|-------|----------|
| Metric strip | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` | Dashboard & usage stats |
| Card grid | `md:grid-cols-2 xl:grid-cols-3` | Providers, combos, quota |
| Split layout | `lg:grid-cols-5` + `lg:col-span-3` / `lg:col-span-2` | Dashboard graph + log |

---

## 5. Component Patterns

### 5.1 Cards

```tsx
// Standard card
<Card className="py-6">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>

// Full-bleed card (tables, graphs, metric strips)
<Card className="!py-0">
  <CardContent className="p-0">...</CardContent>
</Card>
```

- `rounded-xl border bg-card shadow-sm`
- Card header punya `CardAction` slot (2-col grid) untuk tombol aksi di kanan.
- Gunakan `!py-0` saat card berisi table, graph, atau metric strip yang edge-to-edge.

### 5.2 Metric Strip

Pattern untuk menampilkan deretan angka (stat) dalam satu card:

```tsx
<Card className="!py-0">
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-border/60">
    <MetricCell label="REQUESTS" value="1,234" icon={...} />
    <MetricCell label="TOKENS" value="5.2M" icon={...} />
    ...
  </div>
</Card>
```

- `gap-px bg-border/60` + `[&>*]:bg-card` = hairline divider antar cell.
- Setiap cell: icon di box kecil (tinted bg + border) + uppercase label 11px + monospace value.
- Dashboard SysMetric punya `tone` prop: `ok` (emerald), `warn` (amber), `bad` (destructive).
- Usage StatMetric harus konsisten — **belum punya tone system**, perlu ditambahkan.

### 5.3 Tables

```tsx
<Table className="w-full text-sm">
  <TableHeader>
    <TableRow>
      <TableHead className="h-10 px-2 text-left font-medium whitespace-nowrap">
        Column
      </TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow className="hover:bg-muted/50">
      <TableCell className="p-2 align-middle whitespace-nowrap font-mono tabular-nums text-sm">
        1,234
      </TableCell>
    </TableRow>
  </TableBody>
</Table>
```

Aturan tabel:
- Semua data cell pakai `font-mono` — bukan hanya angka.
- Kolom numerik: `text-right font-mono tabular-nums`
- Row height: `h-10` untuk header, auto untuk body.
- Hover: `bg-muted/50`
- Kolom lebar: `w-[X%]` pada `TableHead`.
- Jangan gunakan zebra striping — cukup hover state.

### 5.4 Status Indicators

#### StatusLED (dot + glow)

```tsx
// Active
<div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_var(--tw-shadow-color)] shadow-emerald-500/70" />

// Error
<div className="size-2 rounded-full bg-destructive shadow-[0_0_6px_var(--tw-shadow-color)] shadow-destructive/70" />

// Inactive
<div className="size-2 rounded-full bg-muted-foreground/50" />
```

- Ukuran: `size-2` (8px)
- Glow: `shadow-[0_0_6px]` dengan warna yang sama
- Label: 11px text di sebelah dot

#### LIVE Badge

```tsx
<Badge variant="outline" className="font-mono text-[11px]">
  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
  LIVE
</Badge>
```

#### Transport Badge

```tsx
<Badge variant="outline" className={transportMeta[transport].accentClassName}>
  {transportMeta[transport].label}
</Badge>
```

#### Strategy Badge

```tsx
<Badge variant="secondary" className="font-mono text-[10px]">
  FALLBACK
</Badge>
```

### 5.5 Empty States

Gunakan `Empty` component dengan style yang sesuai tema infra:

```tsx
<Empty>
  <EmptyMedia variant="icon">
    <ServerIcon />
  </EmptyMedia>
  <EmptyTitle>No providers configured</EmptyTitle>
  <EmptyDescription>
    Add a provider to start routing requests.
  </EmptyDescription>
  <EmptyContent>
    <Button>Add provider</Button>
  </EmptyContent>
</Empty>
```

- Dashed border, centered.
- Icon di box kecil dengan muted background.
- Deskripsi singkat dan actionable.
- **Jangan gunakan tone yang terlalu friendly** — ini infra tool, bukan onboarding flow.

### 5.6 Loading States

| Context | Pattern |
|---------|---------|
| Full page | `Spinner` + text centered |
| Card skeleton | `<Skeleton>` dengan `animate-pulse rounded-md bg-accent` |
| Table skeleton | Skeleton rows di dalam table structure |
| Metric skeleton | `Skeleton className="h-5 w-16 mt-0.5"` |
| Button loading | `Spinner` mengganti icon, `data-icon="inline-start"` untuk spacing |

---

## 6. Terminal Aesthetic Layer

Ini layer visual yang membedakan KCG Router dari dashboard SaaS biasa.
Bukan full terminal aesthetic — tapi sentuhan yang mengingatkan user bahwa
mereka sedang mengoperasikan infrastructure.

### 6.1 Packet Log → Terminal Style

Packet log di dashboard harus terasa seperti terminal:

- Background: `bg-black/80` atau `bg-[oklch(0.12)]` (lebih gelap dari card biasa)
- Text: monospace 11px, line-height relaxed
- Warna: emerald untuk `OK`, destructive untuk `ERR`, muted untuk timestamp
- Badge: `tail -f` indicator menunjukkan real-time stream
- Border: `rounded-lg border` dengan warna yang lebih subtle

### 6.2 trace-in Animation

Animasi `trace-in` (fade + translateY) adalah signature animation KCG Router.
Saat ini hanya digunakan di login page — **harus dieksplore di tempat lain:**

- Log entry baru muncul di packet log
- Status change reveal di provider cards
- Notification toast
- Combo member ditambahkan

```css
@keyframes trace-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Gunakan `motion-safe:` prefix untuk respect reduced-motion preference.

### 6.3 Glow Effects

Glow adalah pengganti gradient untuk memberikan kedalaman:

- **Metric values (dark mode):** `text-shadow: 0 0 12px oklch(0.68 0.19 264 / 30%)` pada angka primary
- **Status LED:** `shadow-[0_0_6px]` dengan warna status
- **Active node di graph:** `box-shadow: 0 0 22px -4px` dengan warna node
- **Glow hanya di dark mode.** Di light mode gunakan border/shadow biasa.

### 6.4 Subtle Grid Overlay (Opsional)

Untuk halaman dashboard, bisa ditambahkan subtle grid pattern di background
untuk memperkuat "control room" feel:

```css
.bg-grid {
  background-image:
    linear-gradient(oklch(1 0 0 / 2%) 1px, transparent 1px),
    linear-gradient(90deg, oklch(1 0 0 / 2%) 1px, transparent 1px);
  background-size: 40px 40px;
}
```

Sangat subtle — hanya terlihat jika diperhatikan. Jangan gunakan di semua halaman.

### 6.5 Keyboard Shortcut Hints

Developer mengharapkan keyboard shortcuts. Tampilkan hints di UI:

- Sidebar toggle: `Ctrl+B` (sudah ada, tapi tidak discoverable)
- Shortcut labels di tooltip atau footer sidebar
- Pattern: `kbd` element dengan `font-mono text-[10px] bg-muted border rounded px-1`

### 6.6 Boot Sequence (Opsional)

Saat app pertama kali load, tampilkan brief terminal-style initialization:

```
> Initializing KCG Router...
> Loading providers... 3 active
> Combo engine ready
> Listening on :3000
```

Hanya 3-4 barik, muncul cepat (total < 1 detik), dengan trace-in animation.
Ini set mood tanpa menghambat user.

---

## 7. Animation & Motion

### 7.1 Prinsip Animasi

- **Animasi = informasi.** Setiap animasi harus menyampaikan sesuatu: data masuk, status berubah, koneksi aktif.
- **Satu signature per halaman.** Dashboard punya cat mascot. Login punya trace log. Usage punya network graph. Halaman lain cukup micro-interactions.
- **Respect reduced motion.** Semua animasi harus dibungkus `motion-safe:` atau cek `prefers-reduced-motion`.
- **Durasi:** masuk 200-400ms, keluar 150-300ms, looping 1-3 detik.

### 7.2 Signature Animations

#### Network Graph (Dashboard)

- Cat mascot berjalan di bezier curves dari hub ke provider nodes
- Edge: wavy SVG path dengan `stroke-dasharray: 4 5`, flow animation `dashoffset -18` over 2.4s
- Node: glow on hover (`box-shadow: 0 0 22px -4px`), ping on arrival
- Impact burst: radial gradient circle, scale 0.3→2.3

#### Login Trace Log

- Staggered line-by-line muncul (550ms delay per line)
- Cursor blink: `step-end infinite, 1s period`
- Warna outcome: emerald (ok), amber (limited), sky (reroute)

### 7.3 Micro-interactions

| Element | Interaction | Durasi |
|---------|-------------|--------|
| Card hover | `bg-accent/50` transition | 150ms |
| Button press | `scale(0.98)` | 100ms |
| Sidebar toggle | width transition | 200ms `ease-in-out` |
| Node hover (graph) | border-color + glow + scale(1.04) | 200ms |
| Skeleton | `animate-pulse` | 1.5s |
| Spinner | `animate-spin` | 1s |

### 7.4 What NOT to Animate

- Page transitions (gunakan instant switch, bukan slide/fade)
- Text content (jangan animate teks yang user baca)
- Table rows saat data update (gunakan highlight flash, bukan move animation)
- Decorative elements yang tidak membawa informasi

---

## 8. Do's and Don'ts

### Do

- Gunakan monospace untuk semua data yang user bandingkan
- Konsistensi warna transport di seluruh app
- Tampilkan status indicator di provider cards (bukan hanya detail page)
- Gunakan trace-in animation di tempat baru (log entries, status changes)
- Pastikan dark mode terasa seperti control room
- Gunakan `tabular-nums` untuk semua angka di kolom
- Tampilkan keyboard shortcut hints
- Pakai glow effects untuk menunjukkan "sistem hidup"

### Don't

- Jangan gunakan gradient besar atau background berwarna
- Jangan animate elemen dekoratif yang tidak bawa informasi
- Jangan gunakan bold/extra-bold font weight
- Jangan buat empty state yang terlalu friendly atau cute
- Jangan campur locale (pilih `en-US` atau `id-ID`, konsisten)
- Jangan gunakan zebra striping di tabel — cukup hover
- Jangan tambahkan komentar di codebase kecuali diminta
- Jangan gunakan emoji di UI kecuali itu bagian dari brand (kucing mascot)

---

## 9. File References

| File | Purpose |
|------|---------|
| `styles/globals.css` | CSS custom properties, animations, base styles |
| `src/lib/provider-meta.ts` | Transport accent colors & icons |
| `src/components/ui/` | shadcn/ui primitives (New York style) |
| `src/components/layout/` | AppShell, Sidebar |
| `src/components/usage/UsageGraph.tsx` | Network graph + cat mascot |
| `src/components/login/LoginForm.tsx` | Trace log animation |
| `src/pages/dashboard/` | Dashboard layout & metric patterns |
| `src/pages/usage/` | Usage analytics patterns |
