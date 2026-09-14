import { z } from "zod";
import { AIProvider } from "../ai/gateway";
import { extractJson } from "@/lib/utils";
import { PrdContentJson } from "./prd-generation";

const taskLayerEnumValues = [
  "frontend",
  "backend",
  "database",
  "integration",
  "testing",
] as const;

type TaskLayer = (typeof taskLayerEnumValues)[number];

const taskItemSchema = z.object({
  title: z.string().trim().min(1, "Title task wajib diisi"),
  description: z.string().trim().min(1, "Deskripsi task wajib diisi"),
  layer: z.enum(taskLayerEnumValues),
  phase: z.number().int().positive("Phase harus bilangan bulat positif (1, 2, 3...)"),
  order: z.number().int().positive("Order harus bilangan bulat positif"),
  targetFile: z.string().trim().nullish().transform((v) => v || null),
  dependsOnTitles: z.preprocess((val) => {
    if (Array.isArray(val)) {
      return val.map((v) => String(v).trim()).filter(Boolean);
    }
    if (typeof val === "string" && val.trim()) {
      return [val.trim()];
    }
    return [];
  }, z.array(z.string())).default([]),
});

const taskBreakdownOutputSchema = z.object({
  tasks: z.array(taskItemSchema).min(1, "Minimal harus ada 1 task"),
});

type TaskItem = z.infer<typeof taskItemSchema>;
export type TaskBreakdownOutput = z.infer<typeof taskBreakdownOutputSchema>;

interface DependencyValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validasi dependency batch sesuai PRD Section 7:
 * Memastikan semua dependsOnTitles merujuk ke task yang benar-benar ada dalam batch
 * dan mencegah self-dependency.
 */
function validateTaskDependencies(tasks: TaskItem[]): DependencyValidationResult {
  const titleSet = new Set(tasks.map((t) => t.title.toLowerCase().trim()));
  const errors: string[] = [];

  for (const task of tasks) {
    const currentTitle = task.title.toLowerCase().trim();
    for (const dep of task.dependsOnTitles) {
      const depLower = dep.toLowerCase().trim();
      if (depLower === currentTitle) {
        errors.push(`Task "${task.title}" tidak boleh bergantung pada dirinya sendiri`);
      } else if (!titleSet.has(depLower)) {
        errors.push(
          `Task "${task.title}" bergantung pada "${dep}" yang tidak ditemukan dalam batch task ini`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const TASK_BREAKDOWN_SYSTEM_PROMPT = `Anda adalah seorang Principal Technical Task Architect & Lead Software Engineer.
Tugas Anda adalah membedah sebuah Fitur (Feature) dari PRD menjadi daftar Tasks teknis yang siap dieksekusi satu per satu secara independen oleh AI coding agent.

PRINSIP UTAMA BREAKDOWN TASK:
1. POLA URUTAN EKSEKUSI (FRONTEND-FIRST LALU BACKEND):
   - Urutan default: database (bila membutuhkan tabel/kolom/migrasi baru) → frontend (halaman UI, komponen, state lokal) → backend (API route, server action, query/mutasi) → integration (hubungkan frontend ke backend) → testing (unit test / integration test).
   - Pengecualian: Jika fitur murni backend (misalnya cron job, background worker, migrasi data), sesuaikan alur eksekusi secara teknis dan logis.
2. WAJIB TARGET FILE EKSPLISIT:
   - Setiap task WAJIB mencantumkan saran path file yang konkret dan spesifik pada field 'targetFile' (contoh: 'components/features/item-list.tsx', 'app/api/features/route.ts', 'lib/db/schema.ts').
3. DEPENDENCY ANTAR-TASK EKSPLISIT & VALID:
   - Task yang membutuhkan artefak/file/komponen dari task lain WAJIB mencantumkan judul task tersebut di dalam array 'dependsOnTitles'.
   - Setiap string di 'dependsOnTitles' HARUS PERSIS SAMA (exact match) dengan salah satu 'title' task di dalam daftar 'tasks' yang sama.
   - DILARANG membuat referensi ke task fiktif atau yang tidak ada di dalam daftar.
   - DILARANG membuat circular dependency atau self-dependency (task bergantung pada dirinya sendiri).
4. DESKRIPSI DETAIL & ACTIONABLE:
   - Deskripsi harus sangat spesifik dan teknis: sebutkan props, fungsi, endpoint, skema validasi, atau error handling yang harus dibuat sehingga coding agent tidak perlu bertanya balik.
5. LAYER DAN PHASING:
   - 'layer' WAJIB salah satu dari: "frontend" | "backend" | "database" | "integration" | "testing".
   - 'phase': urutan fase eksekusi bertahap (1, 2, 3...). Task-task di phase yang sama bisa paralel atau berurutan.
   - 'order': urutan eksekusi task di dalam phase yang sama.

FORMAT OUTPUT WAJIB (JSON MURNI):
Respons WAJIB berupa objek JSON valid tanpa teks pengantar atau markdown tambahan:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "layer": "frontend" | "backend" | "database" | "integration" | "testing",
      "phase": 1,
      "order": 1,
      "targetFile": "string",
      "dependsOnTitles": ["title task lain"]
    }
  ]
}`;

export function buildTaskBreakdownPrompt({
  feature,
  prdContext,
}: {
  feature: {
    name: string;
    description?: string | null;
    priority?: string | null;
  };
  prdContext?: {
    productName?: string;
    architecture?: Record<string, unknown>;
    folderStructure?: unknown[];
    databaseSchema?: unknown[];
    apiEndpoints?: unknown[];
    pageSpecs?: unknown[];
  } | Partial<PrdContentJson>;
}): string {
  const fName = feature.name;
  const fDesc = feature.description || "-";
  const fPriority = feature.priority || "must-have";

  const productName = prdContext?.productName || "Aplikasi";
  const arch = prdContext?.architecture || {};
  const endpoints = Array.isArray(prdContext?.apiEndpoints) ? prdContext.apiEndpoints : [];
  const pages = Array.isArray(prdContext?.pageSpecs) ? prdContext.pageSpecs : [];
  const tables = Array.isArray(prdContext?.databaseSchema) ? prdContext.databaseSchema : [];

  return `KONTEKS PRODUK:
Nama Produk: ${productName}
Frontend: ${(arch as any).frontend || "-"}
Backend: ${(arch as any).backend || "-"}
Database: ${(arch as any).database || "-"}

Referensi Halaman / Endpoint / Tabel Relevan di PRD:
- Pages: ${pages.slice(0, 5).map((p: any) => `${p.path} (${p.name})`).join(", ") || "-"}
- API Endpoints: ${endpoints.slice(0, 5).map((e: any) => `${e.method} ${e.path}`).join(", ") || "-"}
- Database Tables: ${tables.slice(0, 5).map((t: any) => t.table).join(", ") || "-"}

FITUR YANG AKAN DIPECAH MENJADI TASKS:
Nama Fitur: ${fName}
Prioritas: ${fPriority}
Deskripsi Fitur: ${fDesc}

TUGAS:
Pecah fitur di atas menjadi daftar Tasks teknis yang siap dieksekusi oleh AI coding agent mengikuti urutan frontend-first lalu backend (atau database dahulu jika butuh skema baru).
Pastikan setiap task memiliki targetFile yang jelas dan dependency eksplisit yang valid.

HANYA kembalikan objek JSON dengan format:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "layer": "frontend" | "backend" | "database" | "integration" | "testing",
      "phase": number,
      "order": number,
      "targetFile": "string",
      "dependsOnTitles": ["string"]
    }
  ]
}`;
}

function parseTaskBreakdownOutput(raw: string): TaskBreakdownOutput {
  const parsed = extractJson(raw);
  const normalized = Array.isArray(parsed) ? { tasks: parsed } : parsed;
  const data = taskBreakdownOutputSchema.parse(normalized);

  const depValidation = validateTaskDependencies(data.tasks);
  if (!depValidation.valid) {
    throw new Error(
      `Validasi dependency task gagal: ${depValidation.errors.join("; ")}`
    );
  }

  return data;
}

export async function generateTaskBreakdownWithRetry(
  aiProvider: AIProvider,
  prompt: string,
  maxRetries: number = 2
): Promise<TaskBreakdownOutput> {
  const maxAttempts = 1 + maxRetries;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const effectivePrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nPERINGATAN (Percobaan ${attempt}/${maxAttempts}): Hasil sebelumnya gagal divalidasi karena: ${
              lastError instanceof Error ? lastError.message : String(lastError)
            }.\nPastikan semua title di 'dependsOnTitles' benar-benar ada di daftar 'tasks' batch ini dan format JSON valid.`;

      const rawResponse = await aiProvider.generate({
        system: TASK_BREAKDOWN_SYSTEM_PROMPT,
        prompt: effectivePrompt,
        jsonMode: true,
      });

      const parsed = parseTaskBreakdownOutput(rawResponse);
      return parsed;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `AI gagal menghasilkan daftar task valid setelah ${maxRetries}x percobaan ulang: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
