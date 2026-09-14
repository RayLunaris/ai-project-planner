import fs from "fs/promises";
import path from "path";
import { scanCodebase } from "../scanner.js";
import { detectFramework } from "../detector.js";
import { summarizeFile } from "../summarizer.js";
import { redact } from "../secret-detector.js";

const CONFIG_FILE = "project-planner.config.json";
const INDEX_DIR = ".project-planner";
const INDEX_FILE = "index.json";

export async function indexCommand() {
  const cwd = process.cwd();
  const configPath = path.join(cwd, CONFIG_FILE);

  let config;
  try {
    const configContent = await fs.readFile(configPath, "utf8");
    config = JSON.parse(configContent);
  } catch {
    console.error(
      "❌ Gagal membaca project-planner.config.json. Pastikan Anda sudah menjalankan `npx project-planner connect`."
    );
    process.exit(1);
  }

  const { projectId, token, apiUrl, syncMode = "basic" } = config;

  console.log(`\n🔍 Mendeteksi framework...`);
  const framework = await detectFramework(cwd);
  console.log(`✅ Framework terdeteksi: ${framework}`);

  console.log(`\n📂 Melakukan scanning file di ${cwd}...`);
  const files = await scanCodebase(cwd);
  console.log(`✅ Menemukan ${files.length} file relevan.`);

  console.log(`\n🤖 Meringkas file menggunakan AI (Mode: ${syncMode})...`);
  
  const indexedFiles: any[] = [];
  let successCount = 0;
  let failCount = 0;

  const BATCH_SIZE = 5;
  const DELAY_MS = 2000;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (file, batchIndex) => {
      const overallIndex = i + batchIndex + 1;
      // Gunakan process.stdout.write untuk satu baris, atau console.log langsung agar tidak menimpa saat paralel
      console.log(`[${overallIndex}/${files.length}] Meringkas ${file.path}...`);

      const fullPath = path.join(cwd, file.path);
      const summary = await summarizeFile(fullPath, { apiUrl, token });

      const fileIndexEntry: any = {
        filePath: file.path,
        extension: file.extension,
        summary,
      };

      if (summary.startsWith("Gagal meringkas")) {
        failCount++;
        console.log(`❌ [${overallIndex}] Gagal: ${file.path}`);
      } else {
        successCount++;
        console.log(`✅ [${overallIndex}] Sukses: ${file.path}`);
      }

      if (syncMode === "full") {
        try {
          const stats = await fs.stat(fullPath);
          if (stats.size <= 100 * 1024) {
            const buffer = await fs.readFile(fullPath);
            if (!buffer.includes(0)) {
              const rawContent = buffer.toString("utf8");
              fileIndexEntry.codeSnippet = redact(rawContent);
            }
          }
        } catch {
          // Abaikan jika tidak bisa membaca snippet
        }
      }

      indexedFiles.push(fileIndexEntry);
    }));
    
    if (i + BATCH_SIZE < files.length) {
      console.log(`⏳ Menunggu ${DELAY_MS}ms sebelum batch selanjutnya untuk menghindari rate limit...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  const indexData = {
    projectId,
    framework,
    syncMode,
    scannedAt: new Date().toISOString(),
    files: indexedFiles,
  };

  const indexDirPath = path.join(cwd, INDEX_DIR);
  await fs.mkdir(indexDirPath, { recursive: true });
  
  const indexFilePath = path.join(indexDirPath, INDEX_FILE);
  await fs.writeFile(indexFilePath, JSON.stringify(indexData, null, 2), "utf8");

  console.log(`\n🎉 Selesai! Berhasil meringkas ${successCount} file (Gagal: ${failCount}).`);
  console.log(`📁 Index disimpan ke ${path.join(INDEX_DIR, INDEX_FILE)}`);
  console.log(`Ketik \`npx project-planner sync\` untuk mengirim index ini ke server.`);
}
