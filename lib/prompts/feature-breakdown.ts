import { z } from "zod";
import { AIProvider } from "../ai/gateway";
import { extractJson } from "@/lib/utils";
import { PrdContentJson } from "./prd-generation";

const featureItemSchema = z.object({
  name: z.string().trim().min(1, "Nama fitur wajib diisi"),
  description: z.string().trim().min(1, "Deskripsi fitur wajib diisi"),
  priority: z.preprocess(
    (val) => {
      if (typeof val === "string") {
        const lower = val.toLowerCase().replace(/_/g, "-").trim();
        if (lower.includes("nice") || lower.includes("low") || lower.includes("optional")) {
          return "nice-to-have";
        }
        return "must-have";
      }
      return "must-have";
    },
    z.enum(["must-have", "nice-to-have"])
  ),
  order: z.number().int().positive().optional(),
});

const featureBreakdownOutputSchema = z.object({
  features: z.array(featureItemSchema).min(1, "Minimal harus ada 1 feature"),
});

export type FeatureBreakdownOutput = z.infer<typeof featureBreakdownOutputSchema>;

const FEATURE_BREAKDOWN_SYSTEM_PROMPT = `Anda adalah seorang Principal Product Architect dan Technical Project Lead berpengalaman.
Tugas Anda adalah membedah dokumen PRD (Product Requirements Document) menjadi daftar fitur (Features) yang terstruktur, jelas, terprioritas, dan siap dipecah lebih lanjut menjadi technical tasks.

PRINSIP EKSEKUSI:
1. GUNAKAN coreFeatures SEBAGAI BASIS UTAMA:
   - Ambil dan kembangkan daftar fitur dari field 'coreFeatures' yang ada di PRD.
   - Sempurnakan nama dan deskripsi fitur agar lebih terarah, modular, dan actionable.
2. BATASAN RUANG LINGKUP (STRICT SCOPE):
   - DILARANG KERAS menambahkan fitur baru yang tidak relevan atau bertentangan dengan 'goals' dan 'nonGoals' di PRD.
   - Jangan memasukkan fitur speculative di luar cakupan spesifikasi produk.
3. DESKRIPSI ACTIONABLE:
   - Setiap fitur harus memiliki deskripsi yang jelas, fungsional, dan actionable (fokus pada fungsionalitas dan output kerja).
4. PRIORITAS FITUR:
   - Tentukan priority untuk setiap fitur: "must-have" (kebutuhan esensial/core MVP) atau "nice-to-have" (enhancement/tahap lanjutan).
5. URUTAN (ORDER):
   - Berikan urutan logis pengerjaan (order: 1, 2, 3...) dimulai dari fitur fondasional (misalnya: Setup/Auth/Data Management dasar) ke fitur fungsional turunan.

FORMAT OUTPUT WAJIB (JSON MURNI):
Respons WAJIB berupa objek JSON valid tanpa teks pengantar atau markdown tambahan:
{
  "features": [
    {
      "name": "string",
      "description": "string",
      "priority": "must-have" | "nice-to-have",
      "order": 1
    }
  ]
}`;

export function buildFeatureBreakdownPrompt({
  prd,
}: {
  prd: Partial<PrdContentJson> | Record<string, unknown>;
}): string {
  const productName = (prd as any).productName || "Aplikasi";
  const overview = (prd as any).overview || {};
  const goals = Array.isArray((prd as any).goals) ? (prd as any).goals : [];
  const nonGoals = Array.isArray((prd as any).nonGoals) ? (prd as any).nonGoals : [];
  const coreFeatures = Array.isArray((prd as any).coreFeatures) ? (prd as any).coreFeatures : [];
  const architecture = (prd as any).architecture || {};

  return `DOKUMEN PRD REFERENSI:
Nama Produk: ${productName}

Overview:
- Problem: ${overview.problem || "-"}
- Solution: ${overview.solution || "-"}
- Target Users: ${Array.isArray(overview.targetUsers) ? overview.targetUsers.join(", ") : "-"}

Goals:
${goals.map((g: string) => `- ${g}`).join("\n") || "-"}

Non-Goals (JANGAN BUAT FITUR UNTUK INI):
${nonGoals.map((ng: string) => `- ${ng}`).join("\n") || "-"}

Core Features di PRD:
${coreFeatures.map((f: any, idx: number) => `${idx + 1}. ${f.name} [${f.priority || "must-have"}]: ${f.description}`).join("\n") || "-"}

Arsitektur:
- Frontend: ${architecture.frontend || "-"}
- Backend: ${architecture.backend || "-"}
- Database: ${architecture.database || "-"}

TUGAS:
Ubah dan kembangkan daftar fitur di atas menjadi daftar Features terstruktur dan terprioritas sesuai prinsip di system prompt.
Pastikan HANYA menghasilkan objek JSON valid dengan struktur:
{
  "features": [
    {
      "name": "string",
      "description": "string",
      "priority": "must-have" | "nice-to-have",
      "order": number
    }
  ]
}`;
}

function parseFeatureBreakdownOutput(raw: string): FeatureBreakdownOutput {
  const parsed = extractJson(raw);
  const normalized = Array.isArray(parsed) ? { features: parsed } : parsed;
  return featureBreakdownOutputSchema.parse(normalized);
}

export async function generateFeatureBreakdownWithRetry(
  aiProvider: AIProvider,
  prompt: string,
  maxRetries: number = 2
): Promise<FeatureBreakdownOutput> {
  const maxAttempts = 1 + maxRetries;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const effectivePrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nPERINGATAN (Percobaan ${attempt}/${maxAttempts}): Respons sebelumnya tidak valid. Pastikan HANYA mengembalikan objek JSON valid: {"features": [{"name": "...", "description": "...", "priority": "must-have" | "nice-to-have", "order": 1}]}.`;

      const rawResponse = await aiProvider.generate({
        system: FEATURE_BREAKDOWN_SYSTEM_PROMPT,
        prompt: effectivePrompt,
        jsonMode: true,
      });

      const parsed = parseFeatureBreakdownOutput(rawResponse);
      return parsed;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `AI gagal menghasilkan daftar fitur valid setelah ${maxRetries}x percobaan ulang: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
