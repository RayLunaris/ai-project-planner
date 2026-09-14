import fs from "fs/promises";
import path from "path";
import { redact } from "./secret-detector.js";

export interface SummarizeConfig {
  apiUrl: string;
  token: string;
}

/**
 * Memanggil AI backend (via CLI summarize endpoint) untuk meringkas isi file.
 * Konten file akan di-redact terlebih dahulu untuk keamanan.
 */
export async function summarizeFile(
  filePath: string,
  config: SummarizeConfig
): Promise<string> {
  try {
    const stats = await fs.stat(filePath);

    // Skip file yang terlalu besar (mis. > 100KB)
    if (stats.size > 100 * 1024) {
      return "File terlalu besar (diabaikan)";
    }

    const buffer = await fs.readFile(filePath);

    // Cek apakah file biner (mengandung null byte)
    if (buffer.includes(0)) {
      return "File biner (diabaikan)";
    }

    const rawContent = buffer.toString("utf8");

    // Skip file kosong
    if (!rawContent.trim()) {
      return "File kosong";
    }

    // 1. Redact secrets dari konten file
    const safeContent = redact(rawContent);

    // 2. Panggil API summarize di backend
    const endpoint = `${config.apiUrl.replace(/\/+$/, "")}/api/cli/summarize`;
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        filename: path.basename(filePath),
        content: safeContent,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Token tidak valid atau kadaluarsa");
      }
      const errText = await response.text();
      throw new Error(`API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.summary || "Tidak ada ringkasan";
  } catch (error: any) {
    console.error(`⚠️ Gagal meringkas ${filePath}: ${error.message}`);
    return "Gagal meringkas";
  }
}
