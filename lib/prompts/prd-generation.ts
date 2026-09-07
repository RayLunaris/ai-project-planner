import { z } from "zod";
import { ClarificationQA } from "./clarification";

export const prdSchema = z.object({
  productName: z.string().min(1, "Nama produk wajib diisi"),
  overview: z.object({
    problem: z.string().min(1, "Problem wajib diisi"),
    solution: z.string().min(1, "Solution wajib diisi"),
    targetUsers: z.array(z.string()).min(1, "Minimal harus ada 1 target user"),
  }),
  goals: z.array(z.string()).min(1, "Minimal harus ada 1 goal"),
  nonGoals: z.array(z.string()),
  requirements: z.object({
    functional: z.array(z.string()).min(1, "Minimal harus ada 1 functional requirement"),
    nonFunctional: z.array(z.string()),
  }),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string()),
  coreFeatures: z.array(
    z.object({
      name: z.string().min(1, "Nama fitur wajib diisi"),
      description: z.string().min(1, "Deskripsi fitur wajib diisi"),
      priority: z.enum(["must-have", "nice-to-have"]),
    })
  ).min(1, "Minimal harus ada 1 core feature"),
  userFlow: z.array(z.string()).min(1, "Minimal harus ada 1 alur user flow"),
  architecture: z.object({
    frontend: z.string().min(1),
    backend: z.string().min(1),
    database: z.string().min(1),
    authentication: z.string().min(1),
    externalServices: z.array(z.string()),
  }),
  databaseSchema: z.array(
    z.object({
      table: z.string().min(1),
      columns: z.array(z.string()).min(1),
    })
  ),
  changeSummary: z.string().optional(),
});

export type PrdContentJson = z.infer<typeof prdSchema>;

export const PRD_GENERATION_SYSTEM_PROMPT = `Anda adalah seorang Principal Software Architect dan Chief Product Officer.
Tugas Anda adalah mengubah ide aplikasi beserta jawaban klarifikasi pengguna menjadi Product Requirements Document (PRD) yang terstruktur, presisi, dan siap diimplementasikan langsung oleh AI coding agent.

PRINSIP UTAMA:
1. OUTPUT WAJIB JSON MURNI: Respons Anda HARUS berupa objek JSON valid yang mengikuti skema yang ditentukan tanpa teks pengantar, penutup, atau tanda kurung markdown (\`\`\`json).
2. PISAHKAN ASUMSI DARI REQUIREMENT: Jangan campurkan apa yang sudah pasti diminta pengguna dengan asumsi teknis Anda. Tulis asumsi di bagian "assumptions".
3. JANGAN MENGARANG KEBUTUHAN BISNIS: Tetap setia pada ruang lingkup yang disepakati pengguna pada sesi klarifikasi.
4. BAHASA: Gunakan Bahasa Indonesia yang lugas, padat, dan profesional untuk konten teks naratif, dan gunakan terminologi teknis standar bahasa Inggris (misalnya: caching, indexing, webhook, OAuth, JWT, state management, REST API).
5. SKEMA STRUKTUR JSON:
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
    { "name": "string", "description": "string", "priority": "must-have" | "nice-to-have" }
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
}`;

export function buildPrdGenerationPrompt({
  initialIdea,
  answers = [],
}: {
  initialIdea: string;
  answers?: ClarificationQA[];
}): string {
  let prompt = `Susunlah PRD terstruktur dalam format JSON berdasarkan detail berikut:\n\n`;
  prompt += `IDE PRODUK:\n"${initialIdea}"\n\n`;

  if (answers.length > 0) {
    prompt += `JAWABAN HASIL KLARIFIKASI:\n`;
    answers.forEach((qa, idx) => {
      prompt += `${idx + 1}. Pertanyaan: ${qa.question}\n   Jawaban: ${qa.answer}\n\n`;
    });
  }

  prompt += `Pastikan semua field pada skema JSON terisi secara lengkap, logis, dan detail.`;
  return prompt;
}

export const PRD_REVISION_SYSTEM_PROMPT = `Anda adalah seorang Principal Software Architect dan Chief Product Officer.
Tugas Anda adalah memperbarui dan merevisi Product Requirements Document (PRD) yang sudah ada berdasarkan instruksi revisi dari pengguna.

PRINSIP UTAMA:
1. OUTPUT WAJIB JSON MURNI: Respons Anda HARUS berupa objek JSON valid yang mengikuti skema PRD tanpa teks pengantar, penutup, atau tanda kurung markdown (\`\`\`json).
2. PERTAHANKAN KONSISTENSI: Pertahankan bagian-bagian dokumen yang tidak terpengaruh oleh revisi. Lakukan modifikasi, penambahan, atau pengurangan secara presisi sesuai instruksi pengguna.
3. KELENGKAPAN: Kembalikan seluruh objek PRD yang telah diperbarui secara utuh sesuai skema, bukan hanya bagian diff perubahannya.
4. RINGKASAN PERUBAHAN: Cantumkan ringkasan singkat perubahan pada field "changeSummary" (string, 1-2 kalimat) yang menjelaskan apa saja poin utama yang diubah atau ditambahkan.
5. BAHASA: Gunakan Bahasa Indonesia yang lugas, padat, dan profesional untuk konten teks naratif, dan gunakan terminologi teknis standar bahasa Inggris (misalnya: caching, indexing, webhook, OAuth, JWT, state management, REST API).
6. SKEMA STRUKTUR JSON:
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
    { "name": "string", "description": "string", "priority": "must-have" | "nice-to-have" }
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
  ],
  "changeSummary": "string (ringkasan singkat poin yang diubah/ditambahkan)"
}`;

export function buildPrdRevisionPrompt({
  currentPrdJson,
  revisionInstruction,
}: {
  currentPrdJson: PrdContentJson;
  revisionInstruction: string;
}): string {
  return `Berikut adalah dokumen PRD saat ini (dalam format JSON):\n${JSON.stringify(currentPrdJson, null, 2)}\n\nINSTRUKSI REVISI DARI PENGGUNA:\n"${revisionInstruction}"\n\nPerbarui seluruh dokumen PRD sesuai instruksi tersebut. Pastikan field "changeSummary" mencantumkan ringkasan singkat mengenai revisi ini. Kembalikan seluruh objek PRD dalam format JSON valid sesuai skema.`;
}
