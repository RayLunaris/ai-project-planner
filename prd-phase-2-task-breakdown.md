# PRD — Fase 2: Feature & Task Breakdown Engine

## 1. Ringkasan & Tujuan

Fase ini dibangun **di atas** Fase 1 (PRD Generator Core harus sudah berjalan). Tujuannya: mengubah PRD yang sudah final menjadi daftar Features, lalu setiap Feature dipecah menjadi Tasks teknis yang siap dieksekusi satu-per-satu oleh AI coding agent — mengikuti pola frontend-first lalu backend, dengan dependency antar-task yang eksplisit.

Prinsip inti: AI coding agent tidak diberi seluruh project sekaligus. Ia hanya diberi **CURRENT TASK + PRD relevan + context terbatas**, supaya hemat token dan mengurangi context drift.

## 2. Tech Stack Tambahan

Tidak ada perubahan stack dari Fase 1. Fase ini menambahkan tabel database baru, prompt baru, dan UI baru di atas fondasi yang sama (Next.js, Supabase, Drizzle, OpenRouter).

## 3. Skema Database Tambahan

```typescript
// lib/db/schema.ts (tambahan)
import { pgEnum } from "drizzle-orm/pg-core";

export const taskStatusEnum = pgEnum("task_status", ["todo", "doing", "blocked", "done", "failed"]);
export const taskLayerEnum = pgEnum("task_layer", ["frontend", "backend", "database", "integration", "testing"]);
export const featurePriorityEnum = pgEnum("feature_priority", ["must-have", "nice-to-have"]);

export const features = pgTable("features", {
  id: uuid("id").defaultRandom().primaryKey(),
  planVersionId: uuid("plan_version_id").references(() => planVersions.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  priority: featurePriorityEnum("priority").default("must-have"),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  featureId: uuid("feature_id").references(() => features.id).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  layer: taskLayerEnum("layer").notNull(),
  phase: integer("phase").notNull(),          // urutan fase eksekusi (1, 2, 3...)
  order: integer("order").notNull(),          // urutan dalam fase yang sama
  status: taskStatusEnum("status").default("todo"),
  targetFile: text("target_file"),            // saran path file yang akan disentuh
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const taskDependencies = pgTable("task_dependencies", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id).notNull(),
  dependsOnTaskId: uuid("depends_on_task_id").references(() => tasks.id).notNull(),
});
```

**Aturan penting:** `tasks.status` tidak boleh diubah jadi `doing` jika ada baris di `task_dependencies` yang `dependsOnTaskId`-nya belum berstatus `done` — validasi ini dilakukan di application layer, bukan cuma di UI.

## 4. Alur Kerja (User Flow)

```
User buka Plan yang sudah "finalized" (dari Fase 1)
   ↓
Klik "Generate Features & Tasks"
   ↓
AI membaca contentJson dari plan_versions (current version)
   ↓
AI menghasilkan daftar Features (dari coreFeatures di PRD, bisa diperluas)
   ↓
User review & edit daftar Features (tambah/hapus/reorder)
   ↓
Untuk setiap Feature, klik "Breakdown to Tasks"
   ↓
AI menghasilkan Tasks: frontend dulu → backend → integration → testing
   ↓
User review dependency antar-task, edit bila perlu
   ↓
Task list siap diberikan ke coding agent satu per satu
   ↓
User (atau agent via automation) update status task: todo → doing → done/failed
```

## 5. Prompt Architecture

```
lib/prompts/
├── feature-breakdown.ts     → PRD JSON → daftar Features terprioritas
└── task-breakdown.ts        → Feature → daftar Tasks dengan layer, phase, dependency
```

**`feature-breakdown.ts`** — prinsip: gunakan `coreFeatures` dari PRD sebagai basis, jangan tambahkan fitur yang tidak selaras dengan `goals`/`nonGoals` di PRD; setiap feature harus punya description yang actionable.

**`task-breakdown.ts`** — prinsip: urutan default frontend → backend → integration → testing (bisa disesuaikan jika feature murni backend, mis. "cron job"); setiap task harus punya `targetFile` yang jelas; task yang bergantung pada task lain harus eksplisit di `depends_on`; description task harus cukup detail agar agent tidak perlu bertanya balik.

## 6. Structured Output — Skema JSON Task

```json
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "layer": "frontend | backend | database | integration | testing",
      "phase": 1,
      "order": 1,
      "targetFile": "string",
      "dependsOnTitles": ["string"]
    }
  ]
}
```

`dependsOnTitles` dipetakan ke `task_dependencies` setelah semua task dalam batch tersimpan (resolve title → id).

## 7. Validasi

```
AI Response (JSON)
   ↓
Zod validation (schema section 6)
   ↓
Cek: apakah dependsOnTitles merujuk ke task yang benar-benar ada di batch ini?
   ↓
Jika ada referensi ke task yang tidak ada → reject batch, regenerate
   ↓
Jika valid → insert ke tabel tasks + resolve task_dependencies
```

## 8. API Endpoints

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/plans/[planId]/features/generate` | Generate daftar Features dari PRD |
| GET/PATCH/DELETE | `/api/features/[featureId]` | CRUD Feature |
| POST | `/api/features/[featureId]/tasks/generate` | Generate Tasks untuk sebuah Feature |
| GET | `/api/features/[featureId]/tasks` | List tasks dalam feature (urut phase+order) |
| PATCH | `/api/tasks/[taskId]/status` | Update status (validasi dependency di server) |
| GET | `/api/plans/[planId]/tasks/next` | Ambil task berikutnya yang siap dikerjakan (todo, semua dependency done) |

Endpoint `tasks/next` ini penting — ini yang nantinya dipakai oleh MCP Server di Fase 3 (`get_next_task` tool), jadi desain endpoint-nya harus reusable sebagai fungsi backend murni, bukan cuma route handler.

## 9. UI Tambahan

**Feature List view** (di dalam halaman Plan):
```
┌─────────────────────────────────────────┐
│ Features                    [+ Generate] │
├─────────────────────────────────────────┤
│ ☐ Autentikasi Google         [must-have] │
│ ☐ Dashboard Project          [must-have] │
│ ☐ Export PDF                 [nice-to]   │
└─────────────────────────────────────────┘
```

**Task Board view** (per Feature, kanban-style):
```
┌─────────┬─────────┬─────────┬────────┬────────┐
│  TODO   │  DOING  │ BLOCKED │  DONE  │ FAILED │
├─────────┼─────────┼─────────┼────────┼────────┤
│ Task 3  │ Task 1  │         │ Task 0 │        │
│ Task 4  │         │         │        │        │
└─────────┴─────────┴─────────┴────────┴────────┘
```

Setiap card task menampilkan: title, layer badge, targetFile, dan tombol "Copy prompt untuk agent" (menyalin title+description+targetFile dalam format siap-paste).

## 10. Task Breakdown untuk AI Coding Agent (Fase 2)

```
[ ] Task 1: Tambah skema database Fase 2 (features, tasks, task_dependencies) + migrasi
[ ] Task 2: Buat prompt template feature-breakdown.ts dan task-breakdown.ts
[ ] Task 3: Implementasi API route POST /api/plans/[planId]/features/generate
[ ] Task 4: Implementasi CRUD API route untuk Feature (edit/hapus/reorder)
[ ] Task 5: Implementasi API route POST /api/features/[featureId]/tasks/generate (dengan Zod validation + dependency resolution)
[ ] Task 6: Implementasi API route PATCH /api/tasks/[taskId]/status (dengan validasi dependency)
[ ] Task 7: Implementasi API route GET /api/plans/[planId]/tasks/next (sebagai reusable function, bukan cuma route)
[ ] Task 8: Buat komponen Feature List UI (dengan generate & edit)
[ ] Task 9: Buat komponen Task Board (kanban drag-and-drop status)
[ ] Task 10: Tambah tombol "Copy prompt untuk agent" di setiap task card
[ ] Task 11: Testing end-to-end: PRD final → generate features → generate tasks → update status → ambil next task
```

## 11. Kriteria Selesai (Definition of Done — Fase 2)

- [ ] Dari satu PRD, sistem bisa generate daftar Features yang selaras dengan `coreFeatures`
- [ ] Setiap Feature bisa dipecah jadi Tasks dengan urutan frontend→backend yang masuk akal
- [ ] Task dengan dependency yang belum selesai tidak bisa diubah ke status `doing`
- [ ] Endpoint `tasks/next` mengembalikan task yang benar-benar siap dikerjakan
- [ ] Fungsi `tasks/next` dibuat reusable (dipanggil langsung sebagai function, bukan hanya lewat HTTP) agar siap dipakai MCP Server di Fase 3

---
*Dokumen ini adalah Fase 2 dari 3. Lanjutkan ke `prd-phase-3-cli-mcp-context.md` setelah fase ini selesai dan diverifikasi berjalan.*
