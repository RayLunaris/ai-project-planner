import { password, select } from "@inquirer/prompts";
import fs from "fs/promises";
import path from "path";

const API_URL = process.env.API_URL || "http://localhost:3000";
const CONFIG_FILE = "project-planner.config.json";

export async function connectCommand() {
  console.log("🔗 Menghubungkan direktori ini ke AI Project Planner...\n");

  const token = await password({
    message: "Masukkan Personal Access Token (PAT) Anda:",
    mask: "*",
  });

  if (!token) {
    console.error("❌ Token tidak boleh kosong.");
    process.exit(1);
  }

  console.log("\nMemvalidasi token dan mengambil daftar project...");

  try {
    const response = await fetch(`${API_URL}/api/cli/projects`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error("❌ Token tidak valid atau sudah kadaluarsa.");
      } else {
        console.error(`❌ Gagal mengambil data (Status: ${response.status})`);
      }
      process.exit(1);
    }

    const data = await response.json();
    const projects = data.projects;

    if (!projects || projects.length === 0) {
      console.error(
        "❌ Anda belum memiliki project. Silakan buat project baru di web app terlebih dahulu."
      );
      process.exit(1);
    }

    const projectId = await select({
      message: "Pilih project yang ingin dihubungkan:",
      choices: projects.map((p: any) => ({
        name: p.name,
        value: p.id,
        description: p.description || "Tidak ada deskripsi",
      })),
    });

    const configContent = {
      projectId,
      token,
      apiUrl: API_URL,
    };

    const cwd = process.cwd();
    const configPath = path.join(cwd, CONFIG_FILE);

    await fs.writeFile(configPath, JSON.stringify(configContent, null, 2), "utf8");

    console.log(`\n✅ Konfigurasi berhasil disimpan ke ${CONFIG_FILE}`);

    // Update .gitignore
    const gitignorePath = path.join(cwd, ".gitignore");
    let gitignoreContent = "";
    
    try {
      gitignoreContent = await fs.readFile(gitignorePath, "utf8");
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.warn("⚠️ Gagal membaca .gitignore:", err.message);
      }
    }

    let hasChanges = false;
    let newGitignore = gitignoreContent;

    if (!gitignoreContent.includes("project-planner.config.json")) {
      newGitignore += `\n# AI Project Planner CLI\nproject-planner.config.json\n`;
      hasChanges = true;
    }
    
    if (!gitignoreContent.includes(".project-planner/")) {
      if (!hasChanges) {
          newGitignore += `\n# AI Project Planner CLI\n`;
      }
      newGitignore += `.project-planner/\n`;
      hasChanges = true;
    }

    if (hasChanges) {
      await fs.writeFile(gitignorePath, newGitignore, "utf8");
      console.log(`✅ File .gitignore berhasil diupdate untuk melindungi konfigurasi Anda.`);
    } else {
       console.log(`ℹ️ Konfigurasi project-planner sudah ada di dalam .gitignore.`);
    }

    console.log("\n🎉 Setup selesai! Direktori ini sudah terhubung.");
    console.log("Ketik `npx project-planner index` untuk mulai melakukan indexing codebase.");

  } catch (error: any) {
    console.error("❌ Terjadi kesalahan jaringan atau server:", error.message);
    process.exit(1);
  }
}
