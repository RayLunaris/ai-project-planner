# PRD — Fase 3: CLI, Codebase Context, & MCP Server

## 1. Ringkasan & Tujuan

Fase terakhir dan paling kompleks. Dibangun di atas Fase 1 (PRD Generator) dan Fase 2 (Task Breakdown) yang sudah berjalan. Fase ini menghubungkan aplikasi web dengan environment coding lokal Rayhan, lewat dua komponen:

1. **CLI + Codebase Indexing** — tool command-line yang men-scan repository lokal, membangun index (file tree, framework detection, ringkasan), dan mengirim/menyimpan index tersebut agar bisa dipakai sebagai context tambahan saat generate PRD/task.
2. **MCP Server** — server yang mengekspos data PRD/Feature/Task project ini sebagai *tools* melalui Model Context Protocol, sehingga Claude Code, Claude Desktop, atau agent lain yang mendukung MCP bisa connect langsung dan mengambil/mengupdate task tanpa copy-paste manual.

## 2. Tech Stack Tambahan

| Komponen | Teknologi |
|---|---|
| CLI | Node.js + TypeScript, dipublikasikan sebagai package lokal (`npx` via `bin` di package.json), atau dijalankan langsung dengan `tsx` untuk penggunaan pribadi |
| File scanning | `fast-glob` + `ignore` (untuk parsing `.gitignore`) |
| Secret detection | Regex pattern sederhana untuk API key/token umum (AWS, OpenAI, dll) sebelum konten file dikirim ke server |
| MCP Server | `@modelcontextprotocol/sdk` (TypeScript SDK resmi), dijalankan sebagai proses terpisah yang expose tools via stdio atau HTTP+SSE transport |
| Autentikasi MCP↔App | Personal access token (generated per user di halaman Settings), dikirim sebagai header saat MCP Server memanggil API aplikasi |

## 3. Skema Database Tambahan

```typescript
export const syncModeEnum = pgEnum("sync_mode", ["basic", "full"]);

export const codebases = pgTable("codebases", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  rootPath: text("root_path").notNull(),          // path lokal, hanya untuk referensi user
  framework: text("framework"),                    // hasil deteksi otomatis, mis. "next.js"
  syncMode: syncModeEnum("sync_mode").default("basic"),
  lastSyncedAt: timestamp("last_synced_at"),
});

export const codebaseFiles = pgTable("codebase_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  codebaseId: uuid("codebase_id").references(() => codebases.id).notNull(),
  filePath: text("file_path").notNull(),
  summary: text("summary"),               // AI-generated summary, bukan isi file penuh
  codeSnippet: text("code_snippet"),       // hanya diisi jika syncMode = "full"
  language: text("language"),
});

export const personalAccessTokens = pgTable("personal_access_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  tokenHash: text("token_hash").notNull(),   // simpan hash, bukan token asli
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});
```

## 4. CLI — Perintah & Alur Kerja

```
npx project-planner doctor      # cek koneksi ke server + validasi token
npx project-planner connect     # link folder lokal ke sebuah Project di web app
npx project-planner index       # scan codebase, generate file tree + summary
npx project-planner sync        # kirim index ke server (basic atau full mode)
npx project-planner status      # tampilkan status sync terakhir
```

**Alur `index`:**
```
Baca .gitignore → exclude node_modules, .env, dll
   ↓
File scanner (fast-glob) → daftar file relevan
   ↓
Framework detector → deteksi dari package.json / composer.json / dll
   ↓
Secret detector → scan pola API key/token, redact sebelum lanjut
   ↓
Untuk mode "basic": hanya file tree + nama file + ekstensi
Untuk mode "full": tambahkan code snippet yang sudah di-redact
   ↓
AI summarizer (model murah, mis. DeepSeek) → ringkas tiap file penting
   ↓
Simpan index lokal (.project-planner/index.json)
```

**Alur `sync`:** kirim isi `.project-planner/index.json` ke endpoint `POST /api/codebases/[codebaseId]/sync` menggunakan personal access token sebagai auth.

## 5. Privacy Mode

| Mode | Yang dikirim ke server |
|---|---|
| Basic | Metadata: file tree, nama file, framework, hasil deteksi route |
| Full | Basic + code snippet yang sudah di-redact dari secret |

Default: **Basic**. User harus eksplisit set `full` di config CLI (`project-planner.config.json`) kalau mau context code yang lebih dalam.

## 6. MCP Server — Tools yang Diekspos

MCP Server dijalankan sebagai proses Node.js terpisah (bisa di-package sebagai bagian dari CLI yang sama: `npx project-planner mcp`), lalu didaftarkan di config Claude Code/Claude Desktop.

| Tool Name | Fungsi | Parameter |
|---|---|---|
| `get_prd` | Ambil PRD (current version) sebuah project | `projectId` |
| `list_features` | List semua feature dalam sebuah plan | `planId` |
| `list_tasks` | List task dalam sebuah feature/plan, dengan filter status | `featureId` atau `planId`, `status?` |
| `get_next_task` | Ambil task berikutnya yang siap dikerjakan (reuse fungsi dari Fase 2) | `planId` |
| `start_task` | Update status task jadi `doing` | `taskId` |
| `complete_task` | Update status task jadi `done` | `taskId` |
| `fail_task` | Update status task jadi `failed` + catatan alasan | `taskId`, `reason` |
| `get_codebase_context` | Ambil ringkasan file relevan dari codebase index (bukan seluruh repo) | `projectId`, `query` |

**Prinsip context compression** (section 25 dari riset awal): `get_codebase_context` **tidak** mengembalikan seluruh index, melainkan melakukan retrieval sederhana (cocokkan `query` dengan `summary` di tabel `codebase_files`, kembalikan top-N yang paling relevan).

## 7. Arsitektur MCP Server

```
Claude Code / Claude Desktop
        │  (MCP protocol via stdio/SSE)
        ▼
   MCP Server (Node.js, @modelcontextprotocol/sdk)
        │  (HTTP calls dengan personal access token)
        ▼
   Next.js API (endpoint yang sama dipakai web app, mis. GET /api/plans/[planId]/tasks/next)
        │
        ▼
   Database (Supabase Postgres)
```

Tools MCP Server **memanggil ulang endpoint API yang sudah ada** dari Fase 1 & 2 (bukan duplikasi logic) — ini alasan kenapa di Fase 2, fungsi seperti `tasks/next` harus dibuat reusable.

## 8. Structured Output — Skema Tool Response

Semua tool MCP mengembalikan JSON terstruktur, contoh untuk `get_next_task`:

```json
{
  "taskId": "string",
  "title": "string",
  "description": "string",
  "layer": "frontend | backend | ...",
  "targetFile": "string",
  "relevantPrdSection": "string",
  "relevantCodeContext": ["string"]
}
```

## 9. API Endpoints Tambahan

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/codebases` | Registrasi codebase baru untuk sebuah project |
| POST | `/api/codebases/[codebaseId]/sync` | Terima index dari CLI, simpan ke `codebase_files` |
| GET | `/api/codebases/[codebaseId]/context` | Retrieval context berdasarkan query (dipakai MCP tool) |
| POST | `/api/settings/tokens` | Generate personal access token baru |
| DELETE | `/api/settings/tokens/[tokenId]` | Revoke token |

## 10. UI Tambahan

**Settings page:** generate/revoke personal access token, daftar codebase yang ter-link, status sync terakhir.

**Codebase view (di dalam Project):**
```
┌─────────────────────────────────────────┐
│ Codebase: my-app (Next.js)               │
│ Sync mode: Basic     Last synced: 2h ago │
│ Files indexed: 84                        │
├─────────────────────────────────────────┤
│ app/page.tsx           - summary...      │
│ lib/db/schema.ts       - summary...      │
└─────────────────────────────────────────┘
```

## 11. Task Breakdown untuk AI Coding Agent (Fase 3)

```
[ ] Task 1: Tambah skema database Fase 3 (codebases, codebase_files, personal_access_tokens) + migrasi
[ ] Task 2: Buat halaman Settings — generate & revoke personal access token
[ ] Task 3: Inisialisasi package CLI terpisah (Node.js + TypeScript, bin entry)
[ ] Task 4: Implementasi CLI command `connect` (link folder lokal ke project via token)
[ ] Task 5: Implementasi file scanner + gitignore parser (Target: cli/src/scanner.ts)
[ ] Task 6: Implementasi framework detector (Target: cli/src/detector.ts)
[ ] Task 7: Implementasi secret detector/redactor (Target: cli/src/secret-detector.ts)
[ ] Task 8: Implementasi AI summarizer per file menggunakan model murah (Target: cli/src/summarizer.ts)
[ ] Task 9: Implementasi CLI command `index` (gabungkan scanner+detector+summarizer, simpan index lokal)
[ ] Task 10: Implementasi API route POST /api/codebases dan POST /api/codebases/[codebaseId]/sync
[ ] Task 11: Implementasi CLI command `sync` (kirim index ke server)
[ ] Task 12: Implementasi API route GET /api/codebases/[codebaseId]/context (retrieval sederhana)
[ ] Task 13: Setup MCP Server skeleton dengan @modelcontextprotocol/sdk (Target: cli/src/mcp-server.ts)
[ ] Task 14: Implementasi tool get_prd, list_features, list_tasks
[ ] Task 15: Implementasi tool get_next_task, start_task, complete_task, fail_task (reuse endpoint Fase 2)
[ ] Task 16: Implementasi tool get_codebase_context
[ ] Task 17: Dokumentasikan cara register MCP Server ke Claude Code / Claude Desktop config
[ ] Task 18: Testing end-to-end: index codebase lokal → sync → connect MCP dari Claude Code → ambil next task → complete task dari agent
```

## 12. Kriteria Selesai (Definition of Done — Fase 3)

- [ ] CLI bisa scan repository lokal dan mendeteksi framework dengan benar
- [ ] Secret/API key tidak pernah terkirim ke server (ter-redact sebelum sync)
- [ ] Mode `basic` dan `full` berfungsi sesuai spesifikasi privacy
- [ ] MCP Server bisa terhubung dari Claude Code/Claude Desktop dan tool-tool-nya berfungsi
- [ ] Agent bisa mengambil next task dan mengupdate statusnya langsung dari dalam sesi coding, tanpa buka web app
- [ ] `get_codebase_context` mengembalikan hasil yang relevan, bukan seluruh index

---
*Dokumen ini adalah Fase 3 (terakhir) dari 3. Setelah fase ini selesai, seluruh visi "AI Project Planner self-hosted" — PRD generator, task orchestration, dan agent integration via MCP — sudah lengkap.*
