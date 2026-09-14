import { z } from "zod";
import { type ClarificationQAInput } from "./clarification";

const folderStructureItemSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    const parts = val.split(" - ");
    if (parts.length > 1) {
      return { path: parts[0].trim(), description: parts.slice(1).join(" - ").trim() };
    }
    return { path: val.trim(), description: "" };
  }
  return val;
}, z.object({
  path: z.string().min(1, "Path direktori/file wajib diisi"),
  description: z.string().nullish().transform((v) => v ?? ""),
}));

type FolderStructureItem = z.infer<typeof folderStructureItemSchema>;

const apiEndpointSchema = z.object({
  method: z.preprocess(
    (v) => (typeof v === "string" ? v.toUpperCase().trim() : "GET"),
    z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
  ),
  path: z.string().min(1, "Path endpoint wajib diisi"),
  description: z.string().nullish().transform((v) => v ?? ""),
  requestBody: z.preprocess(
    (v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : v),
    z.string().nullish().transform((v) => v ?? "")
  ),
  responseBody: z.preprocess(
    (v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : v),
    z.string().nullish().transform((v) => v ?? "")
  ),
  authRequired: z.preprocess(
    (v) =>
      typeof v === "boolean"
        ? v
        : typeof v === "string"
        ? v.toLowerCase() === "true" || v.toLowerCase() === "yes"
        : true,
    z.boolean()
  ).optional().default(true),
});

type ApiEndpoint = z.infer<typeof apiEndpointSchema>;

const pageSpecSchema = z.object({
  path: z.string().min(1, "Path halaman wajib diisi"),
  name: z.string().min(1, "Nama halaman wajib diisi"),
  description: z.string().nullish().transform((v) => v ?? ""),
  components: z.preprocess((val) => {
    if (typeof val === "string") return [val];
    return val;
  }, z.array(z.string()).nullish().transform((v) => v ?? [])),
});

type PageSpec = z.infer<typeof pageSpecSchema>;

const validationRuleSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    return { entity: "Umum", rules: [val] };
  }
  return val;
}, z.object({
  entity: z.string().min(1, "Nama entitas atau formulir wajib diisi"),
  rules: z.preprocess((val) => {
    if (typeof val === "string") return [val];
    return val;
  }, z.array(z.string()).nullish().transform((v) => v ?? [])),
}));

type ValidationRule = z.infer<typeof validationRuleSchema>;

const edgeCaseSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    return { scenario: val, handling: "Ditangani dengan error handling dan validasi sistem standar." };
  }
  return val;
}, z.object({
  scenario: z.string().min(1, "Skenario edge case wajib diisi"),
  handling: z.string().min(1, "Penanganan edge case wajib diisi"),
}));

type EdgeCase = z.infer<typeof edgeCaseSchema>;

const seoStrategySchema = z.object({
  metaTitle: z.string().nullish().transform((v) => v ?? ""),
  metaDescription: z.string().nullish().transform((v) => v ?? ""),
  keywords: z.preprocess((val) => {
    if (typeof val === "string") return val.split(",").map((s) => s.trim()).filter(Boolean);
    return val;
  }, z.array(z.string()).nullish().transform((v) => v ?? [])),
  indexingStrategy: z.string().nullish().transform((v) => v ?? ""),
  openGraph: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
  }).nullish().transform((v) => v ?? undefined),
}).nullish().transform((v) => v ?? null);

type SeoStrategy = z.infer<typeof seoStrategySchema>;

const successMetricSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    return { metric: val, target: "Tercapai optimal", measurementMethod: "" };
  }
  return val;
}, z.object({
  metric: z.string().min(1, "Nama metrik wajib diisi"),
  target: z.string().min(1, "Target metrik wajib diisi"),
  measurementMethod: z.string().nullish().transform((v) => v ?? ""),
}));

type SuccessMetric = z.infer<typeof successMetricSchema>;

const databaseTableSchema = z.object({
  table: z.string().min(1, "Nama tabel wajib diisi"),
  columns: z.array(
    z.preprocess((val) => {
      if (typeof val === "object" && val !== null) {
        const obj = val as Record<string, unknown>;
        const name = obj.name || obj.column || "";
        const type = obj.type || obj.dataType || "";
        const extra = [
          obj.nullable === false ? "NOT NULL" : "",
          obj.defaultValue ? `DEFAULT ${obj.defaultValue}` : "",
          obj.description ? `// ${obj.description}` : "",
        ].filter(Boolean).join(" ");
        return `${name}: ${type} ${extra}`.trim();
      }
      return String(val ?? "");
    }, z.string())
  ).nullish().transform((v) => v ?? []),
  primaryKey: z.preprocess((val) => {
    if (Array.isArray(val)) {
      return val.join(", ");
    }
    return val;
  }, z.string().nullish().transform((v) => v ?? undefined)),
  foreignKeys: z.array(
    z.preprocess((val) => {
      if (typeof val === "object" && val !== null) {
        const obj = val as Record<string, unknown>;
        const col = obj.column || obj.col || "";
        const ref = obj.references || obj.ref || "";
        const onDel = obj.onDelete ? ` ON DELETE ${obj.onDelete}` : "";
        return `${col} -> ${ref}${onDel}`.trim();
      }
      return String(val ?? "");
    }, z.string())
  ).nullish().transform((v) => v ?? []),
  constraints: z.array(z.string()).nullish().transform((v) => v ?? []),
});

type DatabaseTable = z.infer<typeof databaseTableSchema>;

export const prdSchema = z.object({
  // Existing fields (preserved 100%)
  productName: z.string().min(1, "Nama produk wajib diisi"),
  overview: z.object({
    problem: z.string().min(1, "Problem wajib diisi"),
    solution: z.string().min(1, "Solution wajib diisi"),
    targetUsers: z.array(z.string()).min(1, "Minimal harus ada 1 target user"),
  }),
  goals: z.array(z.string()).min(1, "Minimal harus ada 1 goal"),
  nonGoals: z.array(z.string()).nullish().transform((v) => v ?? []),
  requirements: z.object({
    functional: z.array(z.string()).min(1, "Minimal harus ada 1 functional requirement"),
    nonFunctional: z.array(z.string()).nullish().transform((v) => v ?? []),
  }),
  constraints: z.array(z.string()).nullish().transform((v) => v ?? []),
  assumptions: z.array(z.string()).nullish().transform((v) => v ?? []),
  coreFeatures: z.array(
    z.object({
      name: z.string().min(1, "Nama fitur wajib diisi"),
      description: z.string().min(1, "Deskripsi fitur wajib diisi"),
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
    })
  ).min(1, "Minimal harus ada 1 core feature"),
  userFlow: z.array(z.string()).min(1, "Minimal harus ada 1 alur user flow"),
  architecture: z.object({
    frontend: z.string().min(1),
    backend: z.string().min(1),
    database: z.string().min(1),
    authentication: z.string().min(1),
    externalServices: z.array(z.string()).nullish().transform((v) => v ?? []),
  }),
  databaseSchema: z.array(databaseTableSchema).nullish().transform((v) => v ?? []),
  changeSummary: z.string().optional(),

  // Extended fields (PRD Phase 1C Addendum)
  folderStructure: z.array(folderStructureItemSchema).nullish().transform((v) => v ?? []),
  apiEndpoints: z.array(apiEndpointSchema).nullish().transform((v) => v ?? []),
  pageSpecs: z.array(pageSpecSchema).nullish().transform((v) => v ?? []),
  validationRules: z.array(validationRuleSchema).nullish().transform((v) => v ?? []),
  edgeCases: z.array(edgeCaseSchema).nullish().transform((v) => v ?? []),
  seoStrategy: seoStrategySchema.optional(),
  successMetrics: z.array(successMetricSchema).nullish().transform((v) => v ?? []),
});

export type PrdContentJson = z.infer<typeof prdSchema>;

export const PRD_GENERATION_SYSTEM_PROMPT = `Anda adalah seorang Principal Software Architect dan Chief Product Officer.
Tugas Anda adalah mengubah ide aplikasi beserta jawaban klarifikasi pengguna menjadi Product Requirements Document (PRD) yang terstruktur, presisi, dan siap diimplementasikan langsung oleh AI coding agent.

PRINSIP UTAMA:
1. OUTPUT WAJIB JSON MURNI: Respons Anda HARUS berupa objek JSON valid yang mengikuti skema yang ditentukan tanpa teks pengantar, penutup, atau tanda kurung markdown (\`\`\`json).
2. PISAHKAN ASUMSI DARI REQUIREMENT: Jangan campurkan apa yang sudah pasti diminta pengguna dengan asumsi teknis Anda. Tulis asumsi di bagian "assumptions".
3. JANGAN MENGARANG KEBUTUHAN BISNIS: Tetap setia pada ruang lingkup yang disepakati pengguna pada sesi klarifikasi.
4. BAHASA: Gunakan Bahasa Indonesia yang lugas, padat, dan profesional untuk konten teks naratif, dan gunakan terminologi teknis standar bahasa Inggris (misalnya: caching, indexing, webhook, OAuth, JWT, state management, REST API).

KRITERIA WAJIB PENGISIAN FIELD (PHASE 1C):
1. "apiEndpoints" WAJIB KOMPREHENSIF: Wajib mencantumkan seluruh route API backend yang dibutuhkan oleh semua fitur aplikasi (CRUD, autentikasi, aksi bisnis, dan webhook jika relevan). Setiap endpoint harus memiliki method (GET/POST/PUT/PATCH/DELETE), path, description, requestBody, responseBody, dan authRequired (true/false).
2. "pageSpecs" MINIMAL UNTUK SETIAP HALAMAN DI "userFlow": Wajib mendefinisikan spesifikasi minimal untuk SETIAP halaman atau tahapan interaksi yang ada pada alur "userFlow". Tiap entri wajib mencakup path URL, nama halaman (name), deskripsi fungsi (description), dan daftar komponen UI utama (components).
3. "edgeCases" MINIMAL 3 KASUS KONTEKSTUAL: Wajib menyertakan MINIMAL 3 skenario kasus batas yang KONTEKSTUAL terhadap domain aplikasi (DILARANG menggunakan skenario generik seperti "koneksi internet terputus", "server down", atau "error 500"). Berikan skenario nyata seperti race condition stok atau tiket yang tersisa 1, timeout / delayed callback payment gateway, session expired di tengah wizard checkout, double submission form / idempotency. Setiap skenario wajib memiliki mitigasi penanganan teknis ("handling") konkret.
4. "validationRules" DENGAN ANGKA KONKRET: Aturan validasi formulir dan model data WAJIB mencantumkan batasan kuantitatif dengan ANGKA KONKRET (DILARANG aturan abstrak atau normatif seperti "nama harus valid" atau "harga sesuai"). Contoh konkret: "Nama pengguna minimal 3 karakter dan maksimal 50 karakter", "Ukuran file foto profil maksimal 2MB dengan format .jpg/.png", "Nomor handphone wajib nomor Indonesia 10-13 digit", "Harga minimal Rp 10.000".
5. "databaseSchema" EKSPLISIT: Setiap tabel wajib memiliki primaryKey, foreignKeys (dengan aksi ON DELETE jika berelasi), serta constraints eksplisit (seperti UNIQUE, CHECK, NOT NULL).

SKEMA STRUKTUR JSON:
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
    {
      "table": "string",
      "primaryKey": "string (contoh: 'id (UUID)')",
      "columns": ["string (contoh: 'id: uuid NOT NULL', 'name: text NOT NULL')"],
      "foreignKeys": ["string (contoh: 'project_id -> projects(id) ON DELETE CASCADE')"],
      "constraints": ["string (contoh: 'UNIQUE(email)')"]
    }
  ],
  "folderStructure": [
    { "path": "string (contoh: 'app/api/plans/route.ts')", "description": "string" }
  ],
  "apiEndpoints": [
    {
      "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      "path": "string",
      "description": "string",
      "requestBody": "string",
      "responseBody": "string",
      "authRequired": true | false
    }
  ],
  "pageSpecs": [
    {
      "path": "string",
      "name": "string",
      "description": "string",
      "components": ["string"]
    }
  ],
  "validationRules": [
    {
      "entity": "string (nama form/entitas)",
      "rules": ["string"]
    }
  ],
  "edgeCases": [
    {
      "scenario": "string",
      "handling": "string"
    }
  ],
  "seoStrategy": {
    "metaTitle": "string",
    "metaDescription": "string",
    "keywords": ["string"],
    "indexingStrategy": "string"
  },
  "successMetrics": [
    {
      "metric": "string",
      "target": "string",
      "measurementMethod": "string"
    }
  ]
}`;

export function buildPrdGenerationPrompt({
  initialIdea,
  answers = [],
}: {
  initialIdea: string;
  answers?: ClarificationQAInput[];
}): string {
  let prompt = `Susunlah PRD terstruktur dalam format JSON berdasarkan detail berikut:\n\n`;
  prompt += `IDE PRODUK:\n"${initialIdea}"\n\n`;

  if (answers.length > 0) {
    prompt += `JAWABAN HASIL KLARIFIKASI:\n`;
    answers.forEach((qa, idx) => {
      prompt += `${idx + 1}. Pertanyaan: ${qa.question}\n   Jawaban: ${qa.answer}\n\n`;
    });
  }

  prompt += `INSTRUKSI WAJIB PENGISIAN FIELD (PHASE 1C):\n`;
  prompt += `1. "apiEndpoints": Wajib isi seluruh route API backend yang dibutuhkan aplikasi secara komprehensif (method, path, request/response payload, authRequired).\n`;
  prompt += `2. "pageSpecs": Wajib sertakan minimal untuk SETIAP halaman/layar yang disebutkan di "userFlow", lengkap dengan nama, path, deskripsi, dan komponen UI utama.\n`;
  prompt += `3. "edgeCases": Wajib sertakan MINIMAL 3 skenario edge case yang sangat KONTEKSTUAL dengan domain aplikasi (bukan error generik) beserta mitigasi teknis konkretnya.\n`;
  prompt += `4. "validationRules": Wajib sertakan aturan validasi dengan batasan ANGKA KONKRET (contoh: batas min/max karakter, ukuran file dalam MB, nilai numerik pasti; bukan hanya "harus valid").\n\n`;
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

KRITERIA WAJIB PENGISIAN FIELD (PHASE 1C):
1. "apiEndpoints" WAJIB KOMPREHENSIF: Tetap mencakup semua endpoint route backend aplikasi yang relevan dengan fitur-fitur yang ada atau baru ditambahkan.
2. "pageSpecs" MINIMAL UNTUK SETIAP HALAMAN DI "userFlow": Pastikan setiap halaman di alur pengguna memiliki spesifikasi halaman lengkap (path, name, description, components).
3. "edgeCases" MINIMAL 3 KASUS KONTEKSTUAL: Wajib memuat minimal 3 skenario kasus batas yang spesifik terhadap konteks aplikasi (bukan generik) beserta mitigasi teknis konkretnya.
4. "validationRules" DENGAN ANGKA KONKRET: Aturan validasi wajib menggunakan batasan kuantitatif konkret (panjang min/max karakter, ukuran file MB, rentang angka; bukan sekadar "harus valid").
5. "databaseSchema" EKSPLISIT: Pastikan primaryKey, foreignKeys, dan constraints tetap terdefinisi dengan jelas untuk setiap tabel.

SKEMA STRUKTUR JSON:
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
    {
      "table": "string",
      "primaryKey": "string (contoh: 'id (UUID)')",
      "columns": ["string (contoh: 'id: uuid NOT NULL', 'name: text NOT NULL')"],
      "foreignKeys": ["string (contoh: 'project_id -> projects(id) ON DELETE CASCADE')"],
      "constraints": ["string (contoh: 'UNIQUE(email)')"]
    }
  ],
  "folderStructure": [
    { "path": "string (contoh: 'app/api/plans/route.ts')", "description": "string" }
  ],
  "apiEndpoints": [
    {
      "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      "path": "string",
      "description": "string",
      "requestBody": "string",
      "responseBody": "string",
      "authRequired": true | false
    }
  ],
  "pageSpecs": [
    {
      "path": "string",
      "name": "string",
      "description": "string",
      "components": ["string"]
    }
  ],
  "validationRules": [
    {
      "entity": "string (nama form/entitas)",
      "rules": ["string"]
    }
  ],
  "edgeCases": [
    {
      "scenario": "string",
      "handling": "string"
    }
  ],
  "seoStrategy": {
    "metaTitle": "string",
    "metaDescription": "string",
    "keywords": ["string"],
    "indexingStrategy": "string"
  },
  "successMetrics": [
    {
      "metric": "string",
      "target": "string",
      "measurementMethod": "string"
    }
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
  return `Berikut adalah dokumen PRD saat ini (dalam format JSON):\n${JSON.stringify(currentPrdJson, null, 2)}\n\nINSTRUKSI REVISI DARI PENGGUNA:\n"${revisionInstruction}"\n\nPerbarui seluruh dokumen PRD sesuai instruksi tersebut. Pastikan field "changeSummary" mencantumkan ringkasan singkat mengenai revisi ini. Kembalikan seluruh objek PRD dalam format JSON valid sesuai skema.\n\nINSTRUKSI WAJIB PENGISIAN FIELD:\n1. "apiEndpoints": Wajib tetap lengkap dan komprehensif mencakup semua endpoint backend yang relevan dengan fitur-fitur yang ada atau baru ditambahkan.\n2. "pageSpecs": Wajib memiliki spesifikasi minimal untuk SETIAP halaman/layar yang ada di "userFlow" (path, name, description, components).\n3. "edgeCases": Wajib memuat MINIMAL 3 skenario kasus batas yang kontekstual terhadap domain aplikasi (bukan generik) beserta mitigasi teknis konkretnya.\n4. "validationRules": Aturan validasi wajib menggunakan batasan kuantitatif dengan ANGKA KONKRET (contoh: batas min/max karakter, ukuran file MB, rentang nilai numerik; bukan hanya "harus valid").`;
}



