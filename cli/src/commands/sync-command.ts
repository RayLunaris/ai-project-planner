import fs from "fs/promises";
import path from "path";

const CONFIG_FILE = "project-planner.config.json";
const INDEX_DIR = ".project-planner";
const INDEX_FILE = "index.json";

export async function syncCommand() {
  const cwd = process.cwd();
  const configPath = path.join(cwd, CONFIG_FILE);
  const indexPath = path.join(cwd, INDEX_DIR, INDEX_FILE);

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

  let indexData;
  try {
    const indexContent = await fs.readFile(indexPath, "utf8");
    indexData = JSON.parse(indexContent);
  } catch {
    console.error(
      "❌ Gagal membaca .project-planner/index.json. Pastikan Anda sudah menjalankan `npx project-planner index`."
    );
    process.exit(1);
  }

  const { projectId, token, apiUrl } = config;
  const { framework, syncMode, files } = indexData;
  let { codebaseId } = config;

  console.log("🔄 Memulai proses sinkronisasi...");

  // Jika belum ada codebaseId, panggil POST /api/codebases
  if (!codebaseId) {
    console.log("📝 Meregistrasi codebase baru ke server...");
    try {
      const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/codebases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          rootPath: cwd,
          framework,
          syncMode,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Gagal meregistrasi codebase (Status: ${response.status}): ${errorText}`);
        process.exit(1);
      }

      const data = await response.json();
      codebaseId = data.codebase.id;

      // Simpan codebaseId ke config
      config.codebaseId = codebaseId;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
      console.log("✅ Codebase berhasil diregistrasi.");
    } catch (error: any) {
      console.error("❌ Terjadi kesalahan saat meregistrasi codebase:", error.message);
      process.exit(1);
    }
  }

  console.log(`📤 Mengirim data index (${files.length} file) ke server...`);

  // Kirim data ke POST /api/codebases/[codebaseId]/sync
  try {
    const syncResponse = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/codebases/${codebaseId}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        framework,
        syncMode,
        files,
      }),
    });

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      console.error(`❌ Gagal melakukan sinkronisasi (Status: ${syncResponse.status}): ${errorText}`);
      process.exit(1);
    }

    const result = await syncResponse.json();
    console.log(`\n🎉 Selesai! Berhasil sinkronisasi ${result.syncedFilesCount} file (Mode: ${syncMode}).`);
  } catch (error: any) {
    console.error("❌ Terjadi kesalahan jaringan saat sinkronisasi:", error.message);
    process.exit(1);
  }
}
