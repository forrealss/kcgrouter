# KCG Router — Mekanisme Retry, Failover & Cooldown Akun

Dokumentasi konsep di balik penanganan error koneksi provider. Meniru strategi berlapis
yang sudah dipakai 9router (`open-sse/executors/base.js` + `open-sse/services/accountFallback.js`).

Kode:
- `src/server/providers/retry.ts` — retry per-request
- `src/server/services/provider-registry.service.ts` — cooldown/backoff akun
- `src/server/services/router.service.ts` — failover prefix & combo
- `src/server/services/quota-tracker.service.ts` — `isAvailable` (cooldown- & enabled-aware)
- `src/db/migrations/015_add_account_cooldown.ts` — kolom `cooldown_until`, `backoff_level`
- `src/db/migrations/021_add_account_enabled_and_order.ts` — kolom `enabled`, `sort_order`

---

## 1. Ringkasan: dua level, dua skala waktu

Error upstream ditangani di **dua lapisan** dengan jangka waktu berbeda:

```
request masuk
  │
  ├─ Level 1 (detik)  → fetchWithRetry: 502/503/504 dicoba ulang 2–3×
  │                     (error transient di upstream, mis. deploy gateway)
  │
  └─ Level 2 (menit)  → kalau tetap gagal, akun masuk cooldown; router
                        pindah ke akun lain yang sehat. Cooldown berakhir
                        otomatis → akun self-heal tanpa intervensi manual.
```

| Level | Mekanisme | Skala waktu | File |
|---|---|---|---|
| 1 | Retry per-status code (`{ attempts, delayMs }`) | detik | `retry.ts` |
| 2 | Cooldown + exponential backoff per akun | 10 detik – 5 menit | `provider-registry.service.ts` |
| 2b | Failover antar akun/member | per-request | `router.service.ts`, `combo-engine.service.ts` |

Level 1 menangani **kesalahan sementara pada satu request**. Level 2 menangani
**akun yang memang bermasalah** — akun itu "istirahat" dengan jeda yang makin
lama kalau terus gagal, sementara traffic dialihkan ke akun lain.

---

## 2. Level 1 — Retry per-request (`fetchWithRetry`)

### 2.1 Bentuk konfigurasi

Retry dikonfigurasi sebagai **map per status code HTTP** → `RetryRule`:

```ts
interface RetryRule {
  attempts: number;  // retry SETELAH attempt pertama (0 = tidak retry)
  delayMs: number;   // jeda sebelum attempt berikutnya
}

const DEFAULT_RETRY_CONFIG = {
  429: { attempts: 0, delayMs: 0 },   // rate limit → JANGAN retry di tempat
  502: { attempts: 3, delayMs: 3000 }, // Bad Gateway → 3× retry, jeda 3 detik
  503: { attempts: 3, delayMs: 2000 }, // Service Unavailable → 3× retry, jeda 2 detik
  504: { attempts: 2, delayMs: 3000 }, // Gateway Timeout → 2× retry, jeda 3 detik
};
```

Nilai-nilai ini **persis sama** dengan `DEFAULT_RETRY_CONFIG` di 9router
(`open-sse/config/runtimeConfig.js`).

### 2.2 Alur eksekusi

```
attempt ke-1 (fetch, timeout 60s)
   ├─ res.ok = true            → return, selesai
   ├─ error jaringan / timeout → pakai rule 502, retry
   └─ status HTTP error        → cari rule sesuai status
        ├─ attempts tersisa    → sleep(delayMs) → attempt berikutnya
        └─ attempts habis      → return response terakhir; adapter yang
                                 menangani error seperti biasa (throw)
```

`fetchWithRetry` hanya menahan respons HTTP (retry dulu secara transparan);
pola `!res.ok → throw` di adapter **tidak berubah**. Helper melempar error hanya
kalau semua attempt gagal di level transport (network error/timeout) atau caller
abort.

### 2.3 Keputusan desain penting

**429 sengaja `attempts: 0`.** Rate limit adalah sinyal *"pindah akun"*, bukan
*pukul lebih keras akun yang sama*. Response 429 langsung diteruskan ke router
yang akan men-failover ke akun lain — dan akun tersebut masuk cooldown `rate_limit`
(Lihat §3). Memukul akun yang kena rate limit 3× berturut-turut hanya memperpanjang
jeda dan memperbesar peluang blokir upstream.

**Error jaringan/timeout di-map ke rule 502.** Status code tidak diketahui saat
fetch gagal di level transport, jadi dipakai aturan "upstream bermasalah" (502).

**Budget retry per status code** (`attemptsByStatus`). Kalau satu request
mendapat 503 lalu 502, keduanya dihitung dengan budget terpisah — 502 tidak
me-reset budget 503. Ini mencegah kombinasi error memperpanjang total retry
tanpa batas, dan sama dengan bucketing `retryAttemptsByUrl` di 9router.

**Hormati header `Retry-After`.** Kalau server memberi saran jeda (angka detik
atau tanggal HTTP-date), dipakai menggantikan `delayMs` — tetapi dibatasi
(`MAX_RETRY_AFTER_MS = 10_000`) supaya saran ekstrem (mis. 1 jam) tidak
menggantung request. Mirip cap di `computeRetryDelay` 9router. Nilai mentah
header-nya tetap dibawa ke level 2 (§3) sebagai *floor* cooldown akun — jadi
`429 Retry-After: 30` membuat akun di-skip ±30 detik, bukan hanya 1 detik.

**Jitter ±25% pada delay retry.** Delay dikalikan faktor acak `0.75–1.25`.
Tanpa jitter, 100 request yang gagal bersamaan akan retry pada detik yang sama
persis — thundering herd ke upstream yang memang sedang bermasalah. Jitter
menyebarkan retry dalam jendela `delayMs × [0.75, 1.25]`. Header `Retry-After`
tidak di-jitter (instruksi eksplisit server).

**Abort client dipropagasikan, tidak pernah di-retry.** Kalau client disconnect,
sinyal abort diteruskan ke fetch dan error dibiarkan lolos apa adanya.

### 2.4 Override per provider

Setiap pemanggilan bisa me-override rule per status lewat `opts.retry`
(di-merge di atas `DEFAULT_RETRY_CONFIG`):

```ts
fetchWithRetry(url, init, {
  providerName: "OpenAI",
  retry: {
    429: { attempts: 2, delayMs: 5000 }, // override khusus provider ini
  },
});
```

`opts.timeoutMs` mengatur budget per-attempt untuk menerima header respons
(default 60 detik, sama dengan timeout adapter sebelumnya).

### 2.5 Konfigurasi per provider dari UI

Sejak migration 017, setiap provider menyimpan polanya sendiri di kolom
`providers.retry_config` (JSON, `null` = pakai default global). Editor retry
policy tersedia di halaman detail provider (card **Retry Policy** → Configure):

- Tiap status code (429/502/503/504) punya input *attempts* dan *delay (s)*;
  baris kosong = tidak di-override (pakai default global).
- **Reset to defaults** mengosongkan `retry_config` kembali ke `null`.
- Tersimpan lewat `PUT /api/providers/:id/retry-config`
  (`updateProviderRetryConfig` di `provider-registry.service.ts`, yang juga
  memvalidasi status code dan nilai attempts/delay).

Saat request dieksekusi, `router.service.ts` meneruskan `provider.retryConfig`
ke adapter sebagai argumen `opts` kelima (`send`/`sendStream`), dan adapter
meng-merge-nya ke atas default di `fetchWithRetry`. Dua provider dengan
transport sama (mis. dua upstream OpenAI-compatible) punya policy terpisah
karena konfigurasi menempel di **record provider**, bukan di transport.

### 2.6 Observability: metadata retry menempel pada hasil

`fetchWithRetry` menempelkan `RetryMeta { status, retryAfterMs, retries }` ke
setiap `Response` yang dikembalikan (WeakMap, bukan properti enumerable):

- Adapter melempar **`ProviderError`** (membawa `status`, `retryAfterMs`,
  `retries`) untuk respons non-ok — router mengklasifikasi error dari status
  terstruktur ini, bukan regex teks (§3.1), dan memakainya sebagai floor
  cooldown.
- Metadata **di-forward ke hasil sukses** (`carryRetryMeta`) — stream yang
  dikembalikan `sendStream` maupun `CanonicalResponse` dari `send` — sehingga
  router tahu berapa retry yang dilakukan *sebelum* request akhirnya sukses.
  Angka itu dicatat di kolom `request_logs.retries` (migration 016) dan tampil
  sebagai badge `RETRIED N×` di UI logs.

### 2.7 Di mana dipakai

Semua 7 adapter (openai, anthropic, gemini, kiro, mimo, qoder, command-code)
dan `fetchJson` di `helpers.ts` melewati `fetchWithRetry`. Retry terjadi di
level fetch — **sebelum stream mulai** — jadi aman untuk jalur streaming
(stream tidak pernah di-retry separuh jalan; yang di-retry hanyalah pembukaan
koneksi).

Catatan: qoder COSY menandatangani request per-request (AES key + requestId +
timestamp), tapi karena retry mengirim ulang **byte yang sama persis**, signature
tetap valid.

---

## 3. Level 2 — Cooldown & exponential backoff akun

### 3.1 Kapan cooldown dipicu

Ketika sebuah akun akhirnya gagal di level router (semua retry per-request habis
atau response error), router memanggil `recordAccountError(accountId, message, errorKind)`.
`errorKind` berasal dari `classifyError(err)`:

- Status code yang tertanam di pesan adapter (`"X API error 429: ..."`) **lebih
  diutamakan** daripada pencocokan teks bebas — isi body yang menyebut "401" di
  dalam 502 tidak boleh salah klasifikasi, karena sekarang menggerakkan durasi
  cooldown.
  - `401` / `403` → `auth`
  - `429` → `rate_limit`
  - status lain → `server_error`
- Fallback teks: `"Unauthorized"` → auth, `"rate limit"` → rate_limit.

### 3.2 Durasi cooldown (`computeCooldownMs`)

Cooldown dihitung dari tabel di bawah, lalu di-**floor** dengan `Retry-After`
upstream bila ada (`minCooldownMs`): cooldown tidak pernah lebih pendek dari
apa yang diminta server, tapi boleh lebih panjang (backoff rate_limit).
`recordAccountError` menerima `minCooldownMs` opsional sebagai parameter ke-4.

| Error kind | Cooldown | Backoff level |
|---|---|---|
| `rate_limit` | `1000 × 2^(level−1)` ms, cap **4 menit** (level naik tiap error: 1s → 2s → 4s → 8s …) | naik 1, cap 8 |
| `server_error` | **10 detik** tetap | reset 0 |
| `auth` | **5 menit** tetap | reset 0 |

Rasional:
- **rate_limit** → backoff eksponensial: kalau akun terus kena rate limit,
  akun diberi jeda makin panjang, persis `getQuotaCooldown` di 9router.
- **server_error** → blip transien (deploy upstream, gateway sebentar mati)
  sembuh cepat; cooldown pendek supaya akun kembali ke rotasi segera.
- **auth** → API key jelek **tidak akan sembuh sendiri**; cooldown panjang
  sekaligus sinyal ke admin, dan akun hanya kembali aktif setelah key di-update
  (atau request sukses lewat jalur lain).

### 3.3 Persistensi & pemulihan otomatis

Setiap transisi dipublikasikan ke event bus (SSE `/api/events`):
`account:cooldown` (dengan `message`, `errorKind`, `cooldownMs`) saat error
dicatat, dan `account:recovered` saat sukses mereset. Halaman logs memakainya
untuk live announcement; badge cooldown di halaman provider berjalan sebagai
countdown live (re-render per detik, interval berhenti sendiri saat cooldown
habis).

Kolom baru di `provider_accounts` (migration 015):

- `cooldown_until TEXT` — timestamp ISO; akun dilewati selama masih di masa depan.
- `backoff_level INTEGER DEFAULT 0` — level exponential backoff.

```ts
recordAccountError(id, msg, kind)   // set status='error' + cooldown_until + backoff_level
recordAccountSuccess(id)            // reset status='active', cooldown, backoff, last_error
```

Akun dianggap tersedia (`isAccountAvailable`) selama **enabled, status ≠ expired,
dan cooldown-nya sudah lewat** — sebuah akun ber-status `error` yang cooldown-nya
kedaluwarsa otomatis bisa dipakai lagi. Inilah jalur auto-recovery: **tidak ada
cron, tidak ada job reaktivasi** — akun kembali berfungsi pada request berikutnya
setelah cooldown habis.

Status `error` memang masih tersimpan (transparan di UI), tapi tidak lagi
"mematikan" akun selamanya. `updateAccount` dengan API key baru juga mereset
semua state error.

### 3.4 Siapa yang melewati akun cooldown

- **Prefix route** (`router.service.ts`): filter `isAccountAvailable(a)` sebelum loop failover.
- **Combo route** (`combo-engine.service.ts`): `QuotaTracker.isAvailable(member.providerAccountId)`
  dipakai di `resolveTarget`, `nextFallback`, dan round-robin — jadi member yang
  cooldown tidak akan terpilih.
- **Quota tracker** (`quota-tracker.service.ts`): `isAvailable` memeriksa
  flag `enabled` dan `cooldown_until` di samping batas kuota token.

### 3.5 Disable manual vs cooldown otomatis

Cooldown itu keputusan router; **disable itu keputusan operator**. Keduanya
disimpan di kolom berbeda dan tidak boleh saling menimpa:

| | Kolom | Siapa yang set | Berakhir kapan |
|---|---|---|---|
| Cooldown | `cooldown_until`, `status` | router, saat upstream gagal | otomatis, saat window habis |
| Disable | `enabled` | operator, dari UI | hanya kalau dinyalakan lagi manual |

Alasan `enabled` tidak ditumpangkan ke kolom `status`: `recordAccountSuccess`
mereset `status` ke `'active'`, jadi satu request sukses akan menyalakan kembali
koneksi yang sengaja dimatikan. Sebaliknya, menyalakan koneksi **tidak** ikut
menghapus `last_error` atau cooldown — kalau iya, tombol itu jadi pintu belakang
untuk mereset kegagalan upstream yang nyata.

Cek `enabled` harus ada di **dua** tempat, karena kedua jalur routing memakai
fungsi yang berbeda:

- `ProviderRegistry.isAccountAvailable` — dipakai prefix route
- `QuotaTracker.isAvailable` — satu-satunya yang dipakai resolusi combo

Tanpa cek di `QuotaTracker.isAvailable`, koneksi yang di-disable tetap melayani
traffic combo.

### 3.6 Urutan failover

`listAccounts` mengurutkan `sort_order ASC, created_at DESC`, dan
`handlePrefixRoute` mencoba akun **sesuai urutan array itu** — jadi koneksi
paling atas di UI adalah yang dipakai pertama. Urutannya diatur dari halaman
provider — drag & drop, atau menu per-baris (Move up / Move down / Try first)
sebagai jalur keyboard — lewat `PATCH /api/providers/:id/accounts/reorder`.

Catatan: urutan ini hanya berlaku untuk **prefix route**. Combo punya urutannya
sendiri lewat kolom `priority` per member, diatur di halaman Combos.

Migrasi `021_add_account_enabled_and_order.ts` menambah `enabled` + `sort_order`
dan mem-backfill urutan awal dari `created_at DESC`, supaya upgrade tidak
mengubah koneksi mana yang melayani traffic pertama.

---

## 4. Failover antar akun

### 4.1 Prefix route — tidak mati total lagi

Sebelum: ambil akun `active` pertama → gagal → `502`, dan karena semua akun jadi
`error`, request berikutnya mendapat `404 No active account found`. Satu error
upstream mematikan seluruh provider.

Sesudah: `handlePrefixRoute` me-loop **semua akun yang tersedia** (tidak sedang
cooldown), masing-masing lewat `attemptAccount` yang sama:

```
for (account of availableAccounts)
  try   → attemptAccount(...)  → return 200
  catch → recordAccountError(account.id, msg, classifyError(err))
          lanjut ke akun berikutnya

setelah loop:
  tidak ada akun sama sekali    → 404
  semua koneksi di-disable      → 503 ("all connections are disabled")
  semua akun sedang cooldown    → 503 ("are cooling down")
  semua sudah dicoba & gagal    → 502 (dengan pesan error terakhir)
```

Pesan 503-nya dibedakan sengaja: melaporkan "cooling down" padahal koneksinya
memang dimatikan operator akan mengirim orang mencari masalah upstream yang
tidak ada.

### 4.2 Combo route — failover antar member

`handleComboRoute` memakai `excludedMemberIds`: member yang gagal di-`recordAccountError`
lalu disingkirkan, `nextFallback` memilih member berikutnya yang tersedia
(cooldown-aware via `QuotaTracker.isAvailable`). Semua member habis → `503`.
Inner loop memakai `attemptAccount` yang sama dengan prefix route
(±200 baris duplikasi hilang).

### 4.3 `attemptAccount` — satu jalur eksekusi

Helper bersama yang mengeksekusi satu request terhadap satu akun:
decrypt credential → `adapter.sendStream`/`send` → catat usage, quota,
`recordAccountSuccess`, request log. Throw ke pemanggil saat upstream gagal,
pemanggil yang memutuskan langkah failover berikutnya. Untuk streaming, retry
tidak mengganggu karena `sendStream` baru dipanggil setelah fetch berhasil.

---

## 5. Diagram end-to-end

```
client request
  │
  ▼
handleChatRequest ──► prefix? ──► handlePrefixRoute
  │                      │         │
  │                      │         ├─ listAccounts → filter isAccountAvailable
  │                      │         │
  │                      └─────────┴─ for each account ─► attemptAccount
  │                                                          │
  └──► combo? ──► handleComboRoute                            ├─ fetchWithRetry (Level 1)
        │            │ resolveTarget/nextFallback             │   502/503/504 → retry 2-3×
        │            │  (isAvailable → skip cooldown)          │   429 → langsung return (failover)
        │            │                                        │
        │            └─ attemptAccount ───────────────────────┤
        │                                                     ▼
        │                                          sukses → 200 + recordAccountSuccess
        ▼                                          gagal  → recordAccountError(kind)
  semua member habis → 503                                    │
                                                              ▼
                                                 cooldown_until = now + (backoff)
                                                 request berikutnya → akun lain
                                                 cooldown habis → akun otomatis aktif lagi
```

---

## 6. Tuning

Semua angka terkonsentrasi di dua tempat:

| Knob | Lokasi |
|---|---|
| Rule retry default per status | `retry.ts` → `DEFAULT_RETRY_CONFIG` |
| Cap `Retry-After` (10s, hanya delay retry level 1) | `retry.ts` → `MAX_RETRY_AFTER_MS` |
| Jitter retry delay (±25%) | `retry.ts` → `jittered()` |
| Timeout per attempt (60s) | `retry.ts` → `DEFAULT_TIMEOUT_MS` |
| Base/jeda rate_limit (1s, cap 4m, level max 8) | `provider-registry.service.ts` → `COOLDOWN_CONFIG` |
| Cooldown server_error (10s) & auth (5m) | `provider-registry.service.ts` → `COOLDOWN_CONFIG` |
| Kolom retries log (migration 016) | `request_logs.retries` |
| Policy retry per provider (default: null) | `providers.retry_config` (migration 017) |
| Edit policy per provider | UI provider detail → **Retry Policy** → `PUT /api/providers/:id/retry-config` |
| Statistik retry & cooldown dashboard | `GET /api/dashboard/stats` (`getRetryStats` + `countCoolingDownAccounts`) |

---

## 7. Test yang mereproduksi perilaku ini

```bash
bun test src/server/providers/__tests__/retry.test.ts            # retry budget, network error, Retry-After
bun test src/server/services/__tests__/provider-registry.test.ts # cooldown + backoff escalation, retry config round-trip, countCoolingDown
bun test src/server/services/__tests__/quota-tracker.test.ts     # isAvailable cooldown-aware
bun test src/server/services/__tests__/request-log.test.ts       # getRetryStats aggregate + retries round-trip
bun test src/server/routes/__tests__/v1.routes.test.ts           # failover 502→200, 503 semua cooldown
bun test src/server/services/__tests__/account-order.test.ts        # enable/disable + reorder, disable tahan recordAccountSuccess
bun test src/server/services/__tests__/account-routing-order.test.ts # end-to-end: koneksi teratas dipakai dulu, disable dilewati
```

Skenario kunci: 502 berturut lalu 200 (failover berhasil), semua akun cooldown
→ 503, backoff naik 1s→2s→4s, retry 502 setelah 503 tidak me-reset budget,
`Retry-After: 30` menghasilkan cooldown akun ≥ 30 detik, jitter delay dalam
rentang ±25%, dan `retries` tercatat bulat di request log (error maupun
success-setelah-retry).
