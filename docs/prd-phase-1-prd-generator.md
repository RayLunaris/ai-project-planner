# PRD — Fase 1: PRD Generator Core (Fondasi + Auth + AI Clarification + Versioning)

## 1. Ringkasan & Tujuan

Membangun fondasi aplikasi self-hosted "AI Project Planner" — sebuah tool internal (personal use, dengan opsi multi-user di masa depan) yang mengubah ide aplikasi mentah menjadi Product Requirements Document (PRD) terstruktur, siap dipakai sebagai input untuk AI coding agent (Claude Code, Cursor, dll).

Fase ini **tidak** mencakup pemecahan fitur menjadi task (Fase 2) atau CLI/codebase context/MCP server (Fase 3). Fokus murni: input ide → klarifikasi interaktif → generate PRD → edit/revisi → version history → export.

Ini adalah *functional equivalent*, bukan clone kode. Tidak ada source code, prompt asli, atau branding dari produk komersial manapun yang disalin.

## 2. Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | PostgreSQL via Supabase |
| ORM | Drizzle ORM |
| Auth | Auth.js (NextAuth v5) dengan Google OAuth provider, disimpan ke tabel Supabase |
| AI Provider | OpenRouter (akses ke DeepSeek V3, dan model lain bila diperlukan) via AI Gateway abstraction |
| Streaming | Vercel AI SDK (`ai` package) dengan Server-Sent Events |
| Markdown Rendering | `react-markdown` + `remark-gfm` |
| Deployment (fase ini) | Vercel (free tier) |

## 3. Struktur Folder

```
project-root/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx
│   │   └── projects/
│   │       └── [projectId]/
│   │           ├── page.tsx                 # Project overview
│   │           └── plans/
│   │               └── [planId]/page.tsx    # Plan builder (chat + preview)
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── projects/route.ts
│   │   ├── projects/[projectId]/route.ts
│   │   ├── plans/route.ts
│   │   ├── plans/[planId]/route.ts
│   │   ├── plans/[planId]/clarify/route.ts   # streaming clarification Q&A
│   │   ├── plans/[planId]/generate/route.ts  # streaming PRD generation
│   │   ├── plans/[planId]/revise/route.ts    # revise existing PRD via chat
│   │   ├── plans/[planId]/versions/route.ts  # list versions
│   │   └── plans/[planId]/export/route.ts    # export markdown
│   └── layout.tsx
├── components/
│   ├── ui/                       # shadcn components
│   ├── plan-builder/
│   │   ├── chat-panel.tsx
│   │   ├── prd-preview.tsx
│   │   └── version-selector.tsx
│   └── dashboard/
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   └── index.ts
│   ├── ai/
│   │   ├── gateway.ts             # AIProvider abstraction
│   │   ├── providers/
│   │   │   └── openrouter.ts
│   │   └── model-registry.ts
│   ├── prompts/
│   │   ├── clarification.ts
│   │   └── prd-generation.ts
│   └── auth.ts
├── drizzle/
│   └── migrations/
├── .env.local.example
└── package.json
```

## 4. Skema Database (Drizzle ORM)

```typescript
// lib/db/schema.ts
import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum } from "drizzle-orm/pg-core";

export const planStatusEnum = pgEnum("plan_status", ["draft", "clarifying", "generated", "finalized"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  status: planStatusEnum("status").default("draft"),
  currentVersionId: uuid("current_version_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const planVersions = pgTable("plan_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: uuid("plan_id").references(() => plans.id).notNull(),
  versionNumber: integer("version_number").notNull(),
  contentJson: jsonb("content_json").notNull(),   // structured PRD (see section 6)
  contentMarkdown: text("content_markdown").notNull(), // rendered version
  changeSummary: text("change_summary"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clarificationSessions = pgTable("clarification_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: uuid("plan_id").references(() => plans.id).notNull(),
  initialIdea: text("initial_idea").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clarificationAnswers = pgTable("clarification_answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => clarificationSessions.id).notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  order: integer("order").notNull(),
});

export const usageRecords = pgTable("usage_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  planId: uuid("plan_id").references(() => plans.id),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: text("cost_usd"), // stored as string to avoid float precision issues
  createdAt: timestamp("created_at").defaultNow(),
});
```

**Relasi:** `User → Projects → Plans → PlanVersions` (immutable, tidak pernah di-update, hanya insert versi baru). `Plan → ClarificationSession → ClarificationAnswers`.

## 5. Arsitektur AI Gateway

Jangan hard-code provider. Gunakan interface:

```typescript
// lib/ai/gateway.ts
export interface AIProvider {
  generate(request: { system: string; prompt: string; jsonMode?: boolean }): Promise<string>;
  stream(request: { system: string; prompt: string }): AsyncIterable<string>;
}
```

Model registry sederhana untuk fase ini:

```typescript
// lib/ai/model-registry.ts
export const MODEL_REGISTRY = {
  "clarification": { provider: "openrouter", model: "deepseek/deepseek-chat", tier: "cheap" },
  "prd-generation": { provider: "openrouter", model: "deepseek/deepseek-chat", tier: "balanced" },
};
```

> Catatan: model routing lanjutan (memilih model reasoning kuat untuk arsitektur kompleks) baru diperlukan di Fase 2/3. Untuk Fase 1, satu model DeepSeek sudah cukup untuk clarification maupun generation.

## 6. Alur Kerja (User Flow)

```
User login (Google OAuth)
   ↓
Create Project (nama + deskripsi singkat)
   ↓
Create Plan → input ide aplikasi (free text)
   ↓
AI mengajukan 3-5 pertanyaan klarifikasi (streaming, satu per satu atau sekaligus)
   ↓
User menjawab tiap pertanyaan
   ↓
Generate PRD (streaming JSON → render Markdown)
   ↓
Review hasil di split view: Chat (kiri) | PRD Preview (kanan)
   ↓
User bisa minta revisi via chat ("tambahkan requirement X")
   ↓
Setiap revisi = snapshot version baru (immutable)
   ↓
User pilih versi mana yang jadi "current"
   ↓
Export sebagai file .md
```

## 7. Structured Output — Skema JSON PRD

AI **tidak** diminta menulis Markdown langsung. Diminta JSON terstruktur dulu, baru dirender:

```json
{
  "productName": "string",
  "overview": {
    "problem": "string",
    "solution": "string",
    "targetUsers": ["string"]
  },
  "goals": ["string"],
  "nonGoals": ["string"],
  "requirements": {
    "functional": ["string"],
    "nonFunctional": ["string"]
  },
  "constraints": ["string"],
  "assumptions": ["string"],
  "coreFeatures": [
    { "name": "string", "description": "string", "priority": "must-have | nice-to-have" }
  ],
  "userFlow": ["string"],
  "architecture": {
    "frontend": "string",
    "backend": "string",
    "database": "string",
    "authentication": "string",
    "externalServices": ["string"]
  },
  "databaseSchema": [
    { "table": "string", "columns": ["string"] }
  ]
}
```

Field `contentJson` di tabel `plan_versions` menyimpan struktur ini. `contentMarkdown` adalah hasil render dari JSON ini melalui template renderer (bukan AI yang generate markdown langsung) — supaya diff antar versi, validasi, dan re-render selalu konsisten.

## 8. Prompt Architecture

Prompt dipisah per file (JANGAN satu system prompt raksasa):

```
lib/prompts/
├── clarification.ts   → system prompt untuk mengajukan pertanyaan klarifikasi
└── prd-generation.ts  → system prompt untuk generate PRD terstruktur (JSON mode)
```

**`clarification.ts`** — prinsip: jangan berasumsi soal kebutuhan bisnis yang belum disebut user; identifikasi info yang hilang (target user, constraint teknis, skala, autentikasi, dsb); ajukan 3-5 pertanyaan spesifik, bukan generik.

**`prd-generation.ts`** — prinsip: output HARUS JSON valid sesuai skema section 7; pisahkan assumption dari requirement; jangan mengarang kebutuhan bisnis yang tidak disebutkan; gunakan bahasa Indonesia untuk konten PRD (menyesuaikan kebutuhan Rayhan) kecuali istilah teknis.

## 9. Validasi Output

Sebelum JSON dari AI disimpan ke database:

```
AI Response (raw text)
   ↓
JSON.parse + Zod schema validation
   ↓
Jika invalid → retry generation (max 2x) atau tampilkan error ke user
   ↓
Jika valid → simpan sebagai plan_versions.content_json
   ↓
Render ke Markdown via template function
```

## 10. API Endpoints

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/projects` | Buat project baru |
| GET | `/api/projects` | List project milik user |
| POST | `/api/plans` | Buat plan baru dalam sebuah project (input: ide awal) |
| POST | `/api/plans/[planId]/clarify` | Streaming: kirim jawaban, terima pertanyaan berikutnya atau sinyal "siap generate" |
| POST | `/api/plans/[planId]/generate` | Streaming: generate PRD JSON dari idea + jawaban klarifikasi |
| POST | `/api/plans/[planId]/revise` | Revisi PRD berdasarkan instruksi chat → buat versi baru |
| GET | `/api/plans/[planId]/versions` | List semua versi (untuk version selector UI) |
| POST | `/api/plans/[planId]/versions/[versionId]/restore` | Set versi tertentu sebagai current |
| GET | `/api/plans/[planId]/export` | Export markdown current version sebagai file download |

## 11. UI Layout

**Dashboard:** daftar project dalam bentuk card grid, tombol "New Project".

**Plan Builder page:**
```
┌──────────────────────┬─────────────────────────┐
│  Chat Panel           │  PRD Preview            │
│  - AI question 1      │  (react-markdown render │
│  - User answer        │   dari contentMarkdown) │
│  - ...                │                          │
│  [ Version: v3 ▼ ]    │  [Export .md] [Restore]  │
├──────────────────────┤                          │
│ [ Ketik jawaban... ]  │                          │
└──────────────────────┴─────────────────────────┘
```

Streaming: teks PRD muncul incremental di panel preview saat sedang di-generate (perceived latency lebih rendah).

## 12. Desain Visual

Karena ini bukan tentang meniru branding kompetitor, tentukan token desain sendiri. Rekomendasi awal (silakan disesuaikan):
- Font: Inter atau font default shadcn (bukan wajib meniru font produk lain)
- Skala spasi: kelipatan 4px (praktik umum, bukan eksklusif milik produk manapun)
- Palet warna: bebas dipilih sesuai selera — jangan reuse hex code brand kompetitor

## 13. Task Breakdown untuk AI Coding Agent (Fase 1)

Checklist berurutan, satu task = satu prompt ke agent (sesuai preferensi kerja sequential):

```
[x] Task 1: Inisialisasi Next.js project (TypeScript, Tailwind, shadcn/ui)
[x] Task 2: Setup Supabase project + koneksi Drizzle ORM (Target: lib/db/schema.ts, lib/db/index.ts)
[x] Task 3: Setup Auth.js dengan Google OAuth provider (Target: lib/auth.ts, app/api/auth/[...nextauth]/route.ts)
[x] Task 4: Migrasi database — jalankan schema dari section 4 (Target: drizzle/migrations/)
[x] Task 5: Buat AI Gateway abstraction + OpenRouter provider (Target: lib/ai/gateway.ts, lib/ai/providers/openrouter.ts)
[x] Task 6: Buat prompt templates clarification & prd-generation (Target: lib/prompts/)
[x] Task 7: Implementasi API route POST /api/projects dan GET /api/projects
[x] Task 8: Implementasi API route POST /api/plans (dengan initial idea)
[x] Task 9: Implementasi API route streaming /api/plans/[planId]/clarify
[x] Task 10: Implementasi API route streaming /api/plans/[planId]/generate (dengan Zod validation)
[x] Task 11: Implementasi Markdown renderer dari contentJson → contentMarkdown
[x] Task 12: Buat halaman Dashboard (list projects)
[x] Task 13: Buat halaman Plan Builder — Chat Panel component
[x] Task 14: Buat halaman Plan Builder — PRD Preview component (react-markdown)
[x] Task 15: Implementasi Version Selector + restore version
[x] Task 16: Implementasi endpoint export markdown (download file)
[x] Task 17: Implementasi API route /api/plans/[planId]/revise (chat-based revision → versi baru)
[x] Task 18: Setup environment variables (.env.local.example) dan deploy ke Vercel
[x] Task 19: Testing end-to-end: buat project → ide → klarifikasi → generate → revisi → export
```

## 14. Environment Variables

```
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OPENROUTER_API_KEY=
```

## 15. Kriteria Selesai (Definition of Done — Fase 1)

- [x] User bisa login via Google
- [x] User bisa membuat project dan plan baru
- [x] Sistem mengajukan pertanyaan klarifikasi yang relevan (bukan generik)
- [x] PRD ter-generate dalam format JSON valid dan ter-render jadi Markdown yang rapi
- [x] Setiap revisi menghasilkan versi baru yang tidak menghapus versi lama
- [x] User bisa export PRD sebagai file .md
- [x] Total biaya AI API untuk ~50 PRD/bulan tetap di bawah Rp 30.000

---
*Dokumen ini adalah Fase 1 dari 3. Lanjutkan ke `prd-phase-2-task-breakdown.md` setelah fase ini selesai dan diverifikasi berjalan.*
