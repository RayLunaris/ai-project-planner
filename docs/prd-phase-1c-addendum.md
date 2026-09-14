# PRD — Fase 1C: Addendum (PRD JSON Schema & Validation Expansion)

## 0. Konteks & Tujuan

Dokumen ini adalah **perluasan skema PRD (Product Requirements Document)** atas Fase 1 (`prd-phase-1-prd-generator.md`) dan Fase 1B (`prd-phase-1b-addendum.md`).

Tujuan perluasan ini adalah membuat PRD menjadi **jauh lebih presisi, komprehensif, dan siap dieksekusi langsung oleh AI coding agent** tanpa celah ambiguitas arsitektur, database, API, atau edge cases.

Prinsip utama:
1. **Perluasan, Bukan Penggantian**: Semua field lama yang sudah ada di skema tetap dipertahankan 100%.
2. **Backward Compatibility**: PRD versi lama yang tersimpan di database tetap dapat di-parse dan di-render dengan normal (field baru bersifat opsional/nullable dengan default aman untuk data lama).

---

## 1. Perluasan Skema JSON PRD & Zod Validation

### 1.1 Field-Field Baru
Berikut adalah field baru yang ditambahkan ke dalam `prdSchema`:

1. **`folderStructure`**: Daftar struktur folder dan file proyek yang direkomendasikan beserta deskripsinya.
   - Format: Array of `{ path: string, description: string }`
2. **`apiEndpoints`**: Spesifikasi lengkap rute API backend.
   - Format: Array of `{ method: "GET"|"POST"|"PUT"|"PATCH"|"DELETE", path: string, description: string, requestBody?: string, responseBody?: string, authRequired: boolean }`
3. **`pageSpecs`**: Spesifikasi setiap halaman/screen aplikasi.
   - Format: Array of `{ path: string, name: string, description: string, components: string[] }`
4. **`validationRules`**: Aturan validasi formulir dan logika bisnis spesifik.
   - Format: Array of `{ entity: string, rules: string[] }`
5. **`edgeCases`**: Skenario kasus batas teknis dan mitigasi/penanganannya.
   - Format: Array of `{ scenario: string, handling: string }`
6. **`seoStrategy`**: Strategi optimasi mesin pencari dan metadata sharing.
   - Format: `{ metaTitle: string, metaDescription: string, keywords: string[], indexingStrategy?: string, openGraph?: { title?: string, description?: string, image?: string } }`
7. **`successMetrics`**: Metrik kunci keberhasilan produk (KPIs).
   - Format: Array of `{ metric: string, target: string, measurementMethod?: string }`

### 1.2 Penguatan Struktur `databaseSchema`
Setiap tabel pada `databaseSchema` diperkuat agar memiliki relasi dan batasan data yang eksplisit:
- **`table`**: `string` (Nama tabel - field lama, tetap wajib)
- **`columns`**: `string[]` (Daftar kolom - field lama, tetap didukung)
- **`primaryKey`**: `string` (Primary key eksplisit, contoh: `"id (UUID)"`)
- **`foreignKeys`**: `string[]` (Relasi foreign key eksplisit, contoh: `["project_id -> projects(id) ON DELETE CASCADE"]`)
- **`constraints`**: `string[]` (Batasan integritas data eksplisit, contoh: `["UNIQUE(email)", "CHECK(price >= 0)"]`)

---

## 2. Instruksi Prompt AI & Kriteria Wajib Pengisian Field

Untuk memastikan PRD yang dihasilkan berkualitas tinggi dan siap dieksekusi tanpa celah teknis, system prompt dan prompt generator wajib memberikan instruksi eksplisit kepada AI untuk memenuhi kriteria berikut:

1. **`apiEndpoints` Wajib Komprehensif**:
   - Wajib mencakup semua route API backend yang dibutuhkan oleh seluruh fitur aplikasi (CRUD, autentikasi, aksi bisnis, dan webhook jika relevan).
   - Setiap endpoint harus memiliki format payload yang jelas untuk `requestBody` dan `responseBody`, serta penanda `authRequired`.

2. **`pageSpecs` Minimal untuk Setiap Halaman di `userFlow`**:
   - Wajib menyertakan spesifikasi halaman/screen minimal untuk SETIAP halaman atau tahapan interaksi yang disebutkan pada `userFlow`.
   - Setiap halaman wajib merinci `path` URL, `name`, `description`, dan daftar `components` utama yang membangun tampilan tersebut.

3. **`edgeCases` Minimal 3 Kasus Kontekstual (Bukan Generik)**:
   - Wajib menyertakan minimal 3 skenario kasus batas yang spesifik dan kontekstual terhadap domain aplikasi (DILARANG menggunakan skenario generik seperti "koneksi internet terputus", "server down 500", atau "aplikasi crash").
   - Contoh skenario kontekstual: race condition saat perebutan stok atau tiket yang tersisa 1, timeout / delayed callback dari payment gateway, session expired di tengah wizard transaksi multi-step, idempotency saat user menekan tombol submit berkali-kali.
   - Setiap skenario wajib memiliki mitigasi/penanganan teknis (`handling`) yang konkret dan dapat diimplementasikan developer.

4. **`validationRules` dengan Angka Konkret**:
   - Aturan validasi formulir dan model data wajib memuat batasan kuantitatif dan angka konkret (bukan aturan abstrak atau normatif seperti "nama harus valid" atau "harga sesuai").
   - Contoh konkret: "Nama pengguna minimal 3 karakter dan maksimal 50 karakter", "Ukuran file foto profil maksimal 2MB dengan ekstensi .jpg, .jpeg, atau .png", "Nomor handphone wajib berawalan 08 atau +62 dengan panjang 10-13 digit", "Harga produk minimal Rp 10.000 dan kelipatan 100".

5. **`databaseSchema` dengan Relasi dan Batasan Eksplisit**:
   - Setiap tabel wajib menyertakan `primaryKey`, `foreignKeys` (dengan aksi referensi seperti `ON DELETE CASCADE`), serta `constraints` eksplisit (`UNIQUE`, `CHECK`, `NOT NULL`).

---

## 3. Backward Compatibility Matrix

| Field | Versi Baru (Fase 1C) | Versi Lama (Fase 1/1B) | Perilaku Parsing |
| :--- | :--- | :--- | :--- |
| `folderStructure` | Array of objects | `undefined` / `null` | Di-transform menjadi `[]` |
| `apiEndpoints` | Array of objects | `undefined` / `null` | Di-transform menjadi `[]` |
| `pageSpecs` | Array of objects | `undefined` / `null` | Di-transform menjadi `[]` |
| `validationRules` | Array of objects | `undefined` / `null` | Di-transform menjadi `[]` |
| `edgeCases` | Array of objects | `undefined` / `null` | Di-transform menjadi `[]` |
| `seoStrategy` | Object / null | `undefined` / `null` | Di-transform menjadi `null` |
| `successMetrics` | Array of objects | `undefined` / `null` | Di-transform menjadi `[]` |
| `databaseSchema[].primaryKey` | `string` | `undefined` / `null` | Dipertahankan opsional |
| `databaseSchema[].foreignKeys` | `string[]` | `undefined` / `null` | Di-transform menjadi `[]` |
| `databaseSchema[].constraints` | `string[]` | `undefined` / `null` | Di-transform menjadi `[]` |

---

## 4. Implementasi Kode

1. **`lib/prompts/prd-generation.ts`**:
   - Update `prdSchema` dengan Zod schemas baru dan backward compatibility transforms.
   - Update `PRD_GENERATION_SYSTEM_PROMPT`, `buildPrdGenerationPrompt`, `PRD_REVISION_SYSTEM_PROMPT`, dan `PRD_CHAT_AND_REVISION_SYSTEM_PROMPT` dengan instruksi eksplisit sesuai Section 2.
2. **`lib/markdown/renderer.ts`**:
   - Update `renderPrdToMarkdown` agar merender bagian 8 (database schema diperkuat) serta bagian 9 s/d 15 jika datanya ada, dan tetap merender PRD lama dengan rapi tanpa error jika field baru kosong.
