# PRD — Fase 1B: Addendum (Chat Persistence, Gemini Provider, Multiple-Choice Clarification)

## 0. Konteks

Dokumen ini adalah **perbaikan dan perluasan** atas `prd-phase-1-prd-generator.md` yang sudah selesai dibangun dan berjalan. Ini BUKAN fase baru yang berdiri sendiri — tetap bagian dari Fase 1, tapi menambal 3 gap yang ditemukan setelah testing:

1. **Bug:** Chat/pesan tidak tersimpan sama sekali (tabel yang ada di skema awal cuma untuk Q&A klarifikasi terstruktur, bukan chat bebas).
2. **Fitur baru:** Tambah Gemini sebagai AI provider (akses langsung ke Google AI Studio API, bukan lewat OpenRouter), dengan dropdown lengkap semua model Gemini yang tersedia — user bisa pilih sendiri.
3. **Perubahan perilaku:** Semua pertanyaan klarifikasi WAJIB berbentuk multiple-choice (bukan teks bebas lagi).

## 1. Perbaikan #1 — Persistensi Chat

### Root cause
Skema awal (`clarification_sessions` + `clarification_answers`) hanya dirancang untuk menyimpan pasangan pertanyaan-jawaban yang sudah terstruktur dari AI. Pesan bebas seperti "halo" tidak pernah dipetakan ke struktur itu, sehingga tidak pernah disimpan ke database sama sekali — hanya ada di state React sementara dan hilang saat reload/hari berikutnya.

### Perubahan skema

Tambahkan tabel `messages` sebagai satu-satunya sumber kebenaran untuk seluruh riwayat chat (clarification maupun revisi PRD nantinya):

```typescript
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: uuid("plan_id").references(() => plans.id).notNull(),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  options: jsonb("options"),                 // array of {id, label} — diisi jika role="assistant" dan berupa pertanyaan multiple-choice
  selectedOptionId: text("selected_option_id"), // diisi jika role="user" menjawab pertanyaan multiple-choice
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Migrasi data lama:** tabel `clarification_sessions` dan `clarification_answers` dari skema awal dipertahankan hanya untuk `initialIdea` (disimpan di `clarification_sessions`). Pasangan Q&A yang sebelumnya masuk `clarification_answers` sekarang digantikan sepenuhnya oleh tabel `messages` — jangan tulis ke dua tempat sekaligus.

### Perubahan endpoint

`POST /api/plans/[planId]/clarify` sekarang **wajib**:
1. Simpan setiap pesan (baik dari user maupun jawaban AI) ke tabel `messages` sebelum/sesudah diproses.
2. Tambahkan endpoint baru: `GET /api/plans/[planId]/messages` — mengambil seluruh riwayat chat terurut berdasarkan `order`, dipanggil saat halaman Plan Builder dibuka supaya riwayat kemarin muncul lagi.

### Perubahan UI

Chat Panel (`components/plan-builder/chat-panel.tsx`) saat mount harus fetch `GET /api/plans/[planId]/messages` dan render riwayat sebelum menerima input baru — jangan mulai dari state kosong.

## 2. Fitur Baru #2 — Gemini Native Provider + Model Selector

### Provider baru

```typescript
// lib/ai/providers/gemini.ts
// Implementasi AIProvider interface yang sudah ada (lib/ai/gateway.ts),
// memanggil Google AI Studio API (generativelanguage.googleapis.com) langsung
// menggunakan GEMINI_API_KEY. Gunakan SDK resmi @google/generative-ai.
```

Interface `AIProvider` yang sudah ada di Fase 1 **tidak berubah** — `GeminiProvider` tinggal mengimplementasikan `generate()` dan `stream()` yang sama, sehingga tidak mengganggu provider OpenRouter yang sudah jalan.

### Dropdown model dinamis

Karena user minta "semua model yang tersedia", JANGAN hardcode daftar model. Fetch daftar model secara dinamis dari Gemini API (`models.list` endpoint, filter yang mendukung `generateContent`), lalu cache hasilnya (mis. 1 jam) supaya tidak fetch berulang setiap render.

```
GET /api/ai/models?provider=gemini
   ↓
Panggil generativelanguage.googleapis.com/v1beta/models (server-side, pakai API key)
   ↓
Filter model yang support generateContent
   ↓
Cache di memory/Redis-like (atau sederhana: in-memory dengan TTL) selama 1 jam
   ↓
Return: [{ id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" }, ...]
```

### Perubahan skema

Tambahkan kolom pilihan model ke tabel `plans` (supaya tiap plan bisa punya model pilihannya sendiri):

```typescript
// Tambahan di tabel plans
selectedProvider: text("selected_provider").default("openrouter"), // "openrouter" | "gemini"
selectedModel: text("selected_model"), // mis. "gemini-2.5-pro", null = pakai default dari model registry
```

### Perubahan UI

Tambahkan dropdown provider+model di header Plan Builder (di atas Chat Panel), disimpan lewat `PATCH /api/plans/[planId]` setiap kali user ganti pilihan. AI Gateway (`lib/ai/gateway.ts`) membaca `selectedProvider`/`selectedModel` dari plan yang sedang aktif sebelum memanggil provider — bukan lagi selalu dari `model-registry.ts` statis.

### Environment variable baru

```
GEMINI_API_KEY=
```

## 3. Perubahan Perilaku #3 — Clarification Wajib Multiple-Choice

### Perubahan prompt

`lib/prompts/clarification.ts` diubah: setiap pertanyaan yang dihasilkan AI **wajib** menyertakan array `options` (3-5 pilihan kontekstual berdasarkan ide yang diberikan user), tidak boleh lagi berupa pertanyaan open-ended tanpa pilihan.

### Structured output baru

```json
{
  "question": "string",
  "options": [
    { "id": "a", "label": "string" },
    { "id": "b", "label": "string" },
    { "id": "c", "label": "string" }
  ]
}
```

Validasi Zod: `options` minimal 2 item, setiap item wajib punya `id` dan `label` unik dalam satu pertanyaan.

### Perubahan tabel `messages`

Saat AI mengirim pertanyaan (role="assistant"), field `options` diisi sesuai skema di atas. Saat user menjawab dengan klik salah satu pilihan, buat row baru (role="user") dengan `selectedOptionId` diisi ID pilihan yang diklik, dan `content` diisi label pilihan tersebut (supaya tetap enak dibaca ulang di riwayat chat sebagai teks biasa).

### Perubahan UI

Chat Panel: saat pesan dari assistant punya `options`, render sebagai tombol-tombol pilihan (bukan input teks bebas). Setelah user klik salah satu, tombol lain dinonaktifkan/disembunyikan dan jawaban terpilih muncul sebagai bubble chat dari user.

## 4. Task Breakdown untuk AI Coding Agent

```
[x] Task 1: Tambah tabel `messages` ke schema.ts + kolom selectedProvider/selectedModel di tabel `plans`, lalu migrasi
[x] Task 2: Implementasi GET /api/plans/[planId]/messages (ambil riwayat chat terurut)
[x] Task 3: Update POST /api/plans/[planId]/clarify agar menyimpan setiap pesan ke tabel `messages`
[x] Task 4: Update Chat Panel component agar fetch riwayat saat mount, sebelum menerima input baru
[x] Task 5: Install @google/generative-ai, buat lib/ai/providers/gemini.ts mengikuti interface AIProvider yang sudah ada
[x] Task 6: Implementasi GET /api/ai/models?provider=gemini dengan caching sederhana (TTL 1 jam)
[x] Task 7: Tambah dropdown provider+model di header Plan Builder, simpan pilihan via PATCH /api/plans/[planId]
[x] Task 8: Update AI Gateway agar membaca selectedProvider/selectedModel dari plan aktif, fallback ke model-registry.ts jika kosong
[x] Task 9: Update lib/prompts/clarification.ts agar output wajib menyertakan array options (dengan Zod validation minimal 2 opsi)
[x] Task 10: Update tabel messages handling agar field options tersimpan untuk pesan assistant dan selectedOptionId untuk pesan user
[x] Task 11: Update Chat Panel UI agar merender pertanyaan dengan options sebagai tombol pilihan, bukan input teks bebas
[x] Task 12: Testing end-to-end: mulai plan baru → chat tersimpan dan muncul lagi setelah reload → pilih Gemini + model tertentu → jawab klarifikasi lewat tombol pilihan
```

## 5. Kriteria Selesai (Definition of Done — Addendum)

- [x] Chat "halo" atau apapun tersimpan dan tetap muncul setelah reload/hari berikutnya
- [x] User bisa pilih provider Gemini dan model spesifik dari dropdown yang berisi daftar model real-time dari Google AI Studio API
- [x] Setiap pertanyaan klarifikasi baru selalu berbentuk pilihan (minimal 2 opsi), tidak ada lagi input teks bebas untuk menjawab
- [x] Riwayat jawaban pilihan tetap terbaca natural di chat (bukan cuma ID pilihan)

---
*Dokumen ini adalah addendum Fase 1. Setelah selesai, Fase 1 (termasuk perbaikan ini) baru benar-benar dianggap final sebelum lanjut ke Fase 2.*
