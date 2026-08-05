# Kiro Provider (AWS CodeWhisperer)

Catatan teknis adapter Kiro: aturan protokol yang ditemukan lewat reverse-engineering,
bug yang sudah diperbaiki, dan yang masih terbuka.

Kode: `src/server/providers/kiro/`
Endpoint: `POST https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse`

## Ringkasan

Kiro bukan endpoint OpenAI-compatible. Formatnya milik AWS CodeWhisperer:

- **Request**: struktur `conversationState` dengan `history` + `currentMessage`, bukan array `messages`
- **Response**: frame biner AWS EventStream, bukan SSE
- **Tools**: `userInputMessageContext.tools` dengan bentuk `toolSpecification`, bukan field `tools` top-level

Protokolnya tidak terdokumentasi publik. Semua aturan di bawah diverifikasi terhadap
Kiro live (Agustus 2026) dan/atau diturunkan dari implementasi OmniRoute
(`open-sse/translator/request/openai-to-kiro.ts`, `open-sse/executors/kiro.ts`).

Semua klaim di dokumen ini punya test yang mereproduksinya. Kalau mengubah adapter,
jalankan dulu:

```bash
bun test src/server/providers/kiro/
```

## Aturan struktural payload

Tujuh aturan ini wajib. Melanggar salah satunya menghasilkan
`400 {"message":"Improperly formed request.","reason":"REQUEST_BODY..."}` — atau lebih
buruk, **hang tanpa error**, karena Kiro menolak request tanpa mengirim frame terminasi.

### 1. Tools hanya di `currentMessage`, bukan di history

Kiro memvalidasi `toolUses`/`toolResults` di history terhadap skema tools di
`currentMessage`. Skema yang menempel di turn history membuat request ditolak.

```
currentMessage.userInputMessage.userInputMessageContext.tools  ← WAJIB di sini
history[*].userInputMessage.userInputMessageContext.tools      ← WAJIB dibersihkan
```

Ini penyebab bug paling membingungkan di sesi debugging: request pertama sukses,
request kedua hang. Sebabnya, di request pertama user turn satu-satunya *adalah*
`currentMessage`, jadi penempatan yang salah kebetulan benar. Di request kedua turn itu
bergeser ke history, skema ikut terkubur, `currentMessage` kosong.

### 2. Tool result `content` harus array blok teks

```js
content: "total 196"                 // ditolak
content: [{ text: "total 196" }]     // benar
content: [{ text: "" }]              // ditolak — string kosong tidak boleh
```

String kosong didegradasi ke `"(no output)"` (`serializeToolResultContent`).

### 3. Skema tool harus disanitasi

Kiro menolak 17 keyword JSON Schema (`SCHEMA_STRIP_KEYS`, adapter.ts:66):

`additionalProperties`, `anyOf`, `oneOf`, `allOf`, `not`, `$schema`, `$id`, `$ref`,
`$defs`, `definitions`, `if`, `then`, `else`, `unevaluatedProperties`,
`unevaluatedItems`, `contentEncoding`, `contentMediaType`

Juga:
- `required: []` (array kosong) ditolak → dihapus
- `required` wajib ada di skema top-level → ditambahkan bila absen
- Nama tool > 64 karakter ditolak → dipotong 56 char + hash SHA-256 7 char (deterministik)

Penting untuk klien seperti opencode yang skemanya lazim di-generate dengan
`additionalProperties: false`.

### 4. History wajib dibuka user turn

History yang diawali `assistantResponseMessage` ditolak. Disisipkan user turn
sintetis `"(empty)"`.

### 5. Peran wajib beralternasi

Dua `userInputMessage` berurutan tidak boleh. Disisipkan
`assistantResponseMessage: { content: "(empty)" }` di antaranya.

### 6. `toolResults` wajib didahului assistant turn dengan `toolUses`

Orphan (misal history terpotong) ditolak. Alih-alih dibuang, di-inline sebagai teks:

```
[Tool Result (toolUseId)]
<isi>
```

### 7. Tools disintesis dari history bila caller tidak mengirimnya

Kalau history mereferensi `toolUses` tapi request tidak membawa `tools`, Kiro menolak.
Spesifikasi minimal dibuat dari nama tool yang ada di history supaya konteks tool-call
tidak hilang di turn lanjutan.

## Terminasi stream

Bagian tersulit. **Kiro sering tidak mengirim `messageStopEvent`**, dan AWS menahan
socket tetap terbuka setelah turn selesai — jadi EOF juga tidak datang.

Tiga varian trailer yang teramati dari log live:

| # | Urutan trailer | Akhir |
|---|---|---|
| 1 | `metadataEvent` → `contextUsageEvent` → `meteringEvent` | EOF |
| 2 | `metadataEvent` → `contextUsageEvent` → `meteringEvent` | socket ditahan |
| 3 | `metadataEvent` → `contextUsageEvent` | socket ditahan |

`meteringEvent` **opsional** (varian 3 membuktikannya). `metadataEvent` satu-satunya
frame yang hadir di ketiga varian dan selalu paling awal — jadi itu penanda terminal
yang dipakai.

Detail penting: terminasi di `metadataEvent` **tidak langsung** menutup stream.
Trailer biasanya datang dalam satu read, jadi `drainQueue` menghabiskan seluruh chunk
dulu — kalau tidak, `meteringEvent` yang menyusul di chunk yang sama terbuang beserta
token count-nya.

Sinyal terminasi yang dikenali, semuanya di `handleFrame`:

- `messageStopEvent` (terdokumentasi, tapi jarang dikirim)
- `eventType === "done"`
- `payload.messageStopEvent` (bentuk bersarang)
- `meteringEvent`
- `metadataEvent` (andalan utama)
- Frame exception via header `:message-type: exception` / `:exception-type` → dilempar sebagai error
- EOF (`done=true`) sebagai fallback

## Tool calling

`toolUseEvent.input` datang dalam **dua bentuk berbeda**, dan salah menanganinya
membuat tool gagal jalan tanpa pesan error:

| Bentuk | Sifat | Penanganan |
|---|---|---|
| `string` | fragmen JSON inkremental, bisa digabung | diteruskan langsung |
| `object` | **partial object yang tumbuh** — tiap frame menggantikan sebelumnya | dibuffer, di-flush sekali |

Kalau bentuk object diteruskan tiap frame, hasilnya prefiks JSON yang saling tumpang:

```
{"command":"l"}{"command":"ls -la"}   ← JSON rusak, tool tidak jalan
```

Flush bersifat idempotent (`emittedToolArgs`) supaya frame `stop: true` yang disusul
`messageStopEvent` tidak mengirim argumen dua kali.

Satu frame juga bisa membawa **array** tool use, bukan hanya satu objek.

## Frame event yang ditangani

| Event | Aksi |
|---|---|
| `assistantResponseEvent` | konten teks, dipisah dari tag `<thinking>` inline |
| `reasoningContentEvent` | reasoning → channel `reasoning` (4 bentuk payload) |
| `codeEvent` | konten teks |
| `toolUseEvent` | tool call (objek atau array) |
| `metricsEvent` | token usage (bisa bersarang di `payload.metricsEvent`) |
| `usageEvent` | token usage (alternatif) |
| `meteringEvent` | token usage + terminal |
| `metadataEvent` | terminal |
| `contextUsageEvent` | dikonsumsi, tanpa aksi |
| `followupPromptEvent` | dikonsumsi, tanpa aksi |

Reasoning dikirim ke field `reasoning`, bukan `delta`. Kalau salah channel, teks
thinking bocor sebagai konten biasa ke pengguna.

## Debugging

Set `KIRO_DEBUG=1` untuk mencatat tiap frame upstream:

```bash
KIRO_DEBUG=1 bun dev
```

Output:

```
[kiro] stream opened 200
[kiro] read done=false bytes=252 queued=252
[kiro] frame {":event-type":"assistantResponseEvent",...}
[kiro] frame {":event-type":"metadataEvent",...}
[kiro] finishing on stop signal
```

Yang perlu dilihat saat request hang:

1. Ada baris `[kiro] finishing ...`? Kalau tidak, stream tidak pernah menutup.
2. `:event-type` frame terakhir — paling menentukan.
3. `done=` pernah `true`?
4. `queued=` di baris terakhir — kalau bukan nol, ada byte sisa yang tak membentuk frame utuh.

Karena protokolnya tidak terdokumentasi, log frame adalah satu-satunya cara andal
mendiagnosis. Menebak dari gejala gagal lima kali berturut-turut di sesi debugging awal;
log mentah menyelesaikannya dalam satu iterasi.

## Bug yang sudah diperbaiki

Sepuluh bug, tiga lapisan.

**Payload**
1. `req.tools` tidak pernah dikirim ke Kiro — model tidak tahu ada tool sama sekali
2. Tool result dikirim sebagai string, bukan `[{ text }]`
3. Skema tool tidak disanitasi → 400
4. Tools ditempel ke history, bukan `currentMessage`
5. Tool result di message role `user` (bentuk Anthropic) dibuang total
6. History bisa dibuka assistant turn / peran tidak beralternasi
7. Tool result orphan tidak di-inline
8. Tools tidak disintesis dari history

**Stream**
9. Terminasi turn — `messageStopEvent` diasumsikan selalu ada
10. Tool args bentuk object digabung, bukan dibuffer; flush tidak idempotent

## Yang masih terbuka

Ditemukan saat verifikasi dokumen ini, belum diperbaiki.

### `normalizeModelId` merusak sebagian ID model

Regex `/-(\d)-(\d)/g → .$1.$2` (adapter.ts:47) salah:

```
claude-sonnet-5           → claude-sonnet-5          ✓ (tidak kena)
claude-sonnet-4-5         → claude-sonnet.4.5        ✗ seharusnya claude-sonnet-4.5
claude-opus-4-20250514    → claude-opus.4.20250514   ✗ ID bertanggal rusak
```

Dash pertama ikut jadi titik. OmniRoute membatasi grup minor ke 1-2 digit justru untuk
menghindari kasus kedua. Belum terasa karena `claude-sonnet-5` tidak punya pola itu,
tapi akan menggigit saat pakai model bertanggal atau versi dua segmen.

### Jalur non-streaming (`send()`) jauh di belakang

`send()` (adapter.ts:433) belum menerima perbaikan yang sama dengan `sendStream()`:

- **Konten ditimpa, bukan digabung** (adapter.ts:494): `content = frame.payload.content`.
  Kiro mengirim konten dalam banyak frame `assistantResponseEvent`, jadi hanya fragmen
  **terakhir** yang tersisa. Respons non-streaming kemungkinan besar terpotong.
- `finishReason` hanya diset saat `messageStopEvent` — yang sering tidak dikirim. Turn
  dengan tool call bisa salah lapor `"stop"` alih-alih `"tool_call"`.
- Tidak menangani `metadataEvent`, `meteringEvent`, `usageEvent` → usage token 0.
- Tidak menangani `reasoningContentEvent`, `codeEvent`, `toolUseEvent` bentuk array.
- Tool args bentuk string tidak diakumulasi.

Dampaknya terbatas karena opencode memakai streaming. Perlu diperbaiki sebelum ada
klien yang mengandalkan `stream: false`.

### Nama field token di `meteringEvent` belum terkonfirmasi

`meteringEvent` dibaca dengan asumsi field `inputTokens`/`outputTokens`, tapi log yang
tersedia hanya menampilkan header, bukan payload. Log live juga tidak pernah memuat
`metricsEvent`. Kalau usage token tercatat 0 di dashboard, ini penyebabnya — perlu dump
payload `meteringEvent` untuk memastikan nama fieldnya.

## Test

27 test, 2 file:

| File | Cakupan |
|---|---|
| `__tests__/adapter.payload.test.ts` | bentuk payload: tools, tool result, sanitasi skema, aturan struktural |
| `__tests__/adapter.stream.test.ts` | parsing frame, terminasi, tool call, reasoning, exception |

Keduanya memakai encoder frame AWS EventStream sendiri (`buildFrameWithHeaders`) untuk
mensimulasi respons Kiro tanpa jaringan, plus `mockFetchNoClose` untuk mereproduksi
socket yang ditahan terbuka. Test stream punya timeout 3 detik dan gagal dengan
`STREAM_HANG` — jadi regresi terminasi langsung terdeteksi, bukan menggantung.

```bash
bun test src/server/providers/kiro/                              # semua
bun test src/server/providers/kiro/__tests__/adapter.stream.test.ts
```

## Pelajaran

Setiap gejala di sesi debugging ini punya penyebab di lapisan yang **berbeda** dari
tempat gejala muncul. Tool tidak jalan → payload, bukan stream. Stream hang → payload
ditolak, bukan parsing. Perbaikan streaming yang benar tidak menyembuhkan payload yang
sudah ditolak sejak awal.

Untuk protokol tanpa dokumentasi, urutan yang terbukti bekerja:

1. Ambil data mentah (`KIRO_DEBUG=1`) sebelum mengubah apa pun
2. Tulis test yang mereproduksi urutan frame persis dari log
3. Pastikan test itu **gagal** dulu
4. Baru perbaiki

Lima perbaikan pertama di sesi ini dibuat tanpa langkah 1 dan gagal semua.
