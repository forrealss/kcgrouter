# KCG Router — Usulan Sistem Warna

> Status: **proposal, belum diterapkan ke kode.**
> Semua nilai OKLCH di dokumen ini sudah diverifikasi in-gamut sRGB
> dan dihitung rasio kontrasnya. Referensi kondisi saat ini:
> `styles/globals.css`, `src/lib/provider-meta.ts`.

---

## 1. Ringkasan

Tiga masalah di palet sekarang, dua di antaranya bersifat fungsional (bukan selera):

| # | Masalah | Dampak | Prioritas |
|---|---------|--------|-----------|
| 1 | `--chart-5` (Kiro) ≈ `--destructive` | Badge provider Kiro tak terbedakan dari badge error | **Tinggi** |
| 2 | `--chart-1` (MiMo) identik `--primary` | Warna CTA = identitas satu provider | **Tinggi** |
| 3 | Hue brand terpecah tiga (264 / 282 / 292) | UI tak pernah terasa satu warna | Sedang |
| 4 | Status pakai Tailwind mentah, di luar token | Tak bisa di-tune per mode, tak ikut theme | Sedang |
| 5 | `qoder` pakai `pink-500` karena slot chart habis | Inkonsistensi, tanda hue budget habis | Rendah |

Usulan inti: **provider berhenti membawa identitas warna**, lingkaran hue
dibebaskan untuk status. Provider diidentifikasi lewat logo SVG + label monospace.

---

## 2. Bukti masalah (angka)

Diukur dari token dark mode di `styles/globals.css`.

### 2.1 Tabrakan token

```
--destructive: oklch(0.7  0.19 22)   ← error / critical
--chart-5:     oklch(0.68 0.22 20)   ← Kiro
                 ΔL=0.020  ΔC=0.030  ΔH=2.0°
```

```
--primary: oklch(0.68 0.19 264)
--chart-1: oklch(0.68 0.19 264)   ← MiMo
                 ΔL=0  ΔC=0  ΔH=0°   (identik)
```

Di light mode pola sama: `destructive` hue 25 vs `chart-5` hue 20.

Tabrakan lebih ringan: `--chart-4` hue 60 (Anthropic) vs `amber-400`
(status warning) — keduanya dibaca "amber".

### 2.2 Hue brand terpecah

| Sumber | Nilai | OKLCH | Selisih dari logo |
|--------|-------|-------|-------------------|
| Logo (`src/components/icons/Logo.tsx:31`) | `#6D5CFB` | `oklch(0.584 0.227 281.6)` | — |
| Logo stop 2 (`Logo.tsx:32`) | `#4C3FD9` | `oklch(0.487 0.224 277.9)` | ΔH 3.7° |
| `--primary` | — | `oklch(0.68 0.19 264)` | ΔH 17.6° |
| `--accent` | — | `oklch(0.3 0.06 292)` | ΔH 10.4° |

Hue brand juga tersebar ke `src/favicon.svg:5-6` dan
`scripts/generate-icon.ts:10` — jadi mengganti hue brand berarti
menyentuh 4 file, bukan 1.

### 2.3 Hue budget sudah habis

7 transport di `provider-meta.ts` + 4 status = 11 hue dalam 360°.
Tabrakan bersifat matematis, bukan kelalaian. Buktinya `qoder`
(`provider-meta.ts:60`) terpaksa pakai `pink-500` mentah karena
`chart-1..5` sudah terisi. Provider berikutnya akan memperburuk.

### 2.4 Status di luar sistem token

Hitungan pemakaian class Tailwind mentah di `src/**/*.tsx`:

| Warna | Jumlah |
|-------|--------|
| `emerald-*` | 29 |
| `amber-*` | 26 |
| `sky-*` | 1 |
| `pink-*` (qoder) | 1 |

---

## 3. Keputusan arsitektur: warna sebagai sumber daya langka

Tiga sumbu informasi, masing-masing dapat kanal berbeda:

| Sumbu | Kanal | Alasan |
|-------|-------|--------|
| **Identitas provider** | Logo SVG + label mono, chrome netral | Sudah ada 6 logo di `public/images/providers/`. Logo langsung dikenali, tak perlu dihafal |
| **Status / kesehatan** | Warna saturated (hue dipesan eksklusif) | Satu-satunya sumbu yang butuh deteksi pre-attentive |
| **Seri chart** | `--chart-1..6` | Dijelaskan legend, dibaca berdampingan; boleh berbagi hue dengan status karena tak muncul bersamaan |

Konsekuensi: provider ke-12 tidak butuh keputusan desain apa pun. Skalabel.

### Trade-off yang perlu diakui

Kamu kehilangan kemampuan scan tabel usage "per warna provider" sekilas.
Kalau itu penting, kompromi yang masih aman:

> Tint provider dipakai **hanya** di halaman detail provider dan legend chart.
> **Tidak** di badge yang tampil berbarengan dengan indikator status.

---

## 4. Palet usulan

Hue brand disatukan ke **282** (mengikuti logo, file paling mahal diubah).
Chroma canvas diturunkan dari 0.025 → 0.008–0.009 supaya permukaan besar
terasa netral, warna hanya muncul sebagai sinyal.

### 4.1 Dark mode

| Token | OKLCH | Hex | CR vs card |
|-------|-------|-----|-----------|
| `--background` | `oklch(0.165 0.008 282)` | `#0e0e12` | — |
| `--card` | `oklch(0.205 0.009 282)` | `#16171b` | — |
| `--muted` | `oklch(0.25 0.009 282)` | `#212126` | — |
| `--foreground` | `oklch(0.96 0.005 282)` | `#f1f1f5` | 15.95 |
| `--muted-foreground` | `oklch(0.70 0.015 282)` | `#9d9da8` | 6.69 |
| `--primary` | `oklch(0.62 0.20 282)` | `#786ef9` | 4.61 |
| `--success` | `oklch(0.72 0.17 150)` | `#3fc168` | 7.73 |
| `--warning` | `oklch(0.80 0.15 85)` | `#eab532` | 9.51 |
| `--danger` | `oklch(0.65 0.20 25)` | `#f14d4c` | 5.04 |
| `--info` | `oklch(0.72 0.12 215)` | `#26b7d3` | 7.51 |

### 4.2 Light mode

| Token | OKLCH | Hex | CR vs card |
|-------|-------|-----|-----------|
| `--background` | `oklch(0.99 0.002 282)` | `#fbfcfd` | — |
| `--card` | `oklch(1 0 0)` | `#ffffff` | — |
| `--muted` | `oklch(0.965 0.005 282)` | `#f3f3f7` | — |
| `--foreground` | `oklch(0.21 0.02 282)` | `#171721` | 17.76 |
| `--muted-foreground` | `oklch(0.48 0.02 282)` | `#5b5c69` | 6.56 |
| `--primary` | `oklch(0.52 0.22 282)` | `#5e48e1` | 6.04 |
| `--success` | `oklch(0.52 0.13 150)` | `#1d7d3e` | 5.19 |
| `--warning` | `oklch(0.55 0.11 85)` | `#8f6b09` | 4.90 |
| `--danger` | `oklch(0.55 0.21 25)` | `#d01c29` | 5.41 |
| `--info` | `oklch(0.52 0.09 215)` | `#097689` | 5.33 |

Catatan: light `warning` dan `info` sengaja ber-chroma rendah — pada hue 85
dan 215, gamut sRGB membatasi chroma maksimum jika kontras 4.5:1 pada putih
harus tetap terpenuhi (maxC di L=0.55 H=85 adalah 0.123).

### 4.3 Chart palette (6 slot)

Bertambah dari 5 → 6 supaya `qoder` tak perlu warna mentah.

| Token | Dark OKLCH | Hex | CR | Light OKLCH | Hex | CR |
|-------|-----------|-----|-----|-------------|-----|-----|
| `--chart-1` | `oklch(0.68 0.17 282)` | `#8a87fd` | 5.94 | `oklch(0.53 0.21 282)` | `#604edf` | 5.74 |
| `--chart-2` | `oklch(0.74 0.12 195)` | `#25c2c2` | 8.17 | `oklch(0.58 0.099 195)` | `#008c8c` | 4.09 |
| `--chart-3` | `oklch(0.76 0.16 145)` | `#68cb6e` | 8.85 | `oklch(0.55 0.15 145)` | `#278733` | 4.56 |
| `--chart-4` | `oklch(0.80 0.15 85)` | `#eab532` | 9.51 | `oklch(0.58 0.119 85)` | `#9a7300` | 4.33 |
| `--chart-5` | `oklch(0.68 0.20 25)` | `#fc5855` | 5.68 | `oklch(0.56 0.20 25)` | `#d02b31` | 5.15 |
| `--chart-6` | `oklch(0.70 0.19 330)` | `#dd6cd6` | 6.13 | `oklch(0.55 0.20 330)` | `#ad36a7` | 5.42 |

Semua slot ≥ 3.0 (ambang non-text UI component), semua in-gamut sRGB.

### 4.4 Hue map — alokasi eksklusif

```
  25°  danger      / chart-5
  85°  warning     / chart-4
 145°  (chart-3)
 150°  success
 195°  (chart-2)
 215°  info
 282°  primary / brand / chart-1
 330°  (chart-6)
```

Separasi hue antar status (dark): success↔warning 65°, warning↔danger 60°,
success↔danger 125°, danger↔info 170°. Semua ≥ 60°.

---

## 5. Aksesibilitas

### 5.1 Hasil verifikasi

Semua token teks lolos **WCAG AA 4.5:1** terhadap `--card`, di kedua mode.
Semua slot chart lolos ambang 3.0 untuk non-text. Nol kegagalan.

Sebagai pembanding, palet sekarang sebenarnya juga sudah lolos AA
(`muted-foreground` 6.01, `primary` 5.72 pada card dark) — jadi kontras
bukan alasan utama perubahan ini. Alasan utamanya tetap tabrakan di §2.1.

### 5.2 Warna tidak boleh jadi satu-satunya kanal

Simulasi color-blind (matriks Machado 2009, severity 1.0) pada pasangan
status dark mode, rasio kontras antar dua warna status:

| Pasangan | Normal | Deuteranopia | Protanopia |
|----------|--------|--------------|------------|
| success / danger | 1.53 | 1.23 | 2.26 |
| success / warning | 1.23 | 1.37 | 1.04 |
| warning / danger | 1.88 | 1.69 | 2.35 |

Angka mendekati 1.0 berarti dua warna praktis tak terbedakan. `success`
versus `warning` pada protanopia = **1.04**: efektif warna yang sama.

Ini bukan cacat palet usulan — memilih hue lain tidak menyelesaikannya,
karena keterbatasannya ada di penglihatan, bukan di token. Implikasinya
adalah aturan wajib:

> **StatusLED tidak boleh mengandalkan warna saja.** Setiap indikator status
> harus membawa warna **plus** teks (`OK` / `ERR` / `WARN`) atau bentuk ikon
> yang berbeda. Dot polos berwarna, tanpa pendamping, adalah bug aksesibilitas.

Ini menyentuh pola StatusLED di `design-guidelines.md` §5.4, yang saat ini
mencontohkan dot tanpa label wajib.

### 5.3 Guardrail yang perlu masuk guideline

Belum ada satu pun di `design-guidelines.md`:

- Teks minimum 4.5:1; UI component / border minimum 3.0:1
- `text-[10px]`/`text-[11px]` (17 pemakaian) tidak boleh digabung dengan
  warna di bawah `--muted-foreground`
- Focus ring harus terlihat di kedua mode, minimum 3.0:1 terhadap latar sekitar
- Status = warna + teks/ikon, selalu

---

## 6. Alternatif yang dipertimbangkan

### 6.1 Tetap indigo 264, cuma perbaiki tabrakan

Paling murah, tak menyentuh logo. Tapi hue brand tetap terpecah tiga dan
canvas tetap ber-chroma 0.025. Layak dipilih kalau kamu mau perubahan minimal.

### 6.2 Netral dingin + accent hangat (amber/tembaga)

Paling tidak generik, dan kontras suhu membuat elemen aktif terasa "menyala" —
cocok dengan metafora router. Tapi berarti mengulang `Logo.tsx`, `favicon.svg`,
dan `generate-icon.ts`. Perubahan besar untuk keuntungan yang murni estetis.
**Tidak disarankan sekarang.**

### 6.3 Catatan jujur soal indigo

Indigo/violet adalah pilihan paling generik di dev tooling saat ini. Panduan
bilang "control room, bukan dashboard SaaS", tapi hue ber-chroma di background
justru sinyal SaaS. Yang lebih menentukan feel "instrument" bukan hue-nya,
melainkan seberapa sedikit warna di permukaan besar — karena itu §4 menurunkan
chroma canvas dan mempertahankan hue. Itu memberi 80% hasil dengan 20% biaya
dibanding §6.2.

---

## 7. Urutan penerapan yang disarankan

| # | Langkah | File | Sifat |
|---|---------|------|-------|
| 1 | Pisahkan `chart-5` dari `destructive`, `chart-1` dari `primary` | `styles/globals.css` | **Bug fix** |
| 2 | Tambah token `--success` / `--warning` / `--info` / `--danger` | `styles/globals.css` | Aditif, aman |
| 3 | Migrasi 56 pemakaian `emerald`/`amber`/`sky` → token | `src/**/*.tsx` | Mekanis, luas |
| 4 | Tambah `--chart-6`, pindahkan `qoder` dari `pink-500` | `globals.css`, `provider-meta.ts` | Kecil |
| 5 | Satukan hue brand ke 282 | `globals.css` | Visual, sedang |
| 6 | Turunkan chroma canvas ke 0.008–0.009 | `globals.css` | Visual, sedang |
| 7 | Provider → chrome netral, logo sebagai identitas | `provider-meta.ts` + komponen badge | **Perubahan arah**, perlu keputusan |
| 8 | Tambah section aksesibilitas ke guideline | `design-guidelines.md` | Dokumentasi |

Langkah 1–4 bisa dikerjakan tanpa perdebatan desain. Langkah 7 sebaiknya
diputuskan dulu karena mengubah cara provider dibaca di seluruh app.

---

## 8. Temuan di luar warna

Ditemukan saat menelusuri kode, tidak tercakup usulan ini:

- **Font stack tidak ada.** `--font-mono` / `--font-sans` tidak didefinisikan
  di `styles/globals.css`, dan `src/index.html` tidak load font apa pun.
  Padahal "monospace adalah bahasa pertama untuk data" adalah pilar utama
  guideline. Identitas tipografi saat ini bergantung default browser, jadi
  berbeda di Linux/macOS/Windows.
- **Locale campur.** 18 pemakaian `en-US` vs 6 `id-ID` (`QuotaCard.tsx:31`,
  `ApiKeyManager.tsx:78`, `UsagePage.tsx:37-43`). Guideline menyuruh memilih
  tapi tidak memilih. Saran: `en-US`, karena `<html lang="en">` dan UI copy English.
- **`design-guidelines.md` tidak direferensikan dari mana pun** — tidak ada di
  `AGENTS.md` maupun `CLAUDE.md`. Sementara `.agents/skills/frontend-design/SKILL.md`
  akan ter-load lebih dulu saat kerja UI dan berpotensi bertabrakan.
- **Pola belum ter-cover di guideline:** form & dialog (4 komponen `*Dialog.tsx`),
  toast (`sonner`, 4 file), chart (`recharts` — palette ada, aturan axis/tooltip/
  empty-data tidak ada).
