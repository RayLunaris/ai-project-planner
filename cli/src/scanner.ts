import fs from "fs/promises";
import path from "path";
import ignore from "ignore";
import fg from "fast-glob";

const DEFAULT_IGNORES = [
  "node_modules/**",
  ".git/**",
  ".next/**",
  "dist/**",
  "build/**",
  ".env",
  ".env.*",
  "project-planner.config.json", // Auto-ignore our own config
  ".project-planner/**" // Auto-ignore our own data folder
];

export interface ScannedFile {
  path: string;
  extension: string;
}

export async function scanCodebase(cwd: string): Promise<ScannedFile[]> {
  const ig = ignore().add(DEFAULT_IGNORES);

  try {
    const gitignorePath = path.join(cwd, ".gitignore");
    const gitignoreContent = await fs.readFile(gitignorePath, "utf8");
    ig.add(gitignoreContent);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      console.warn(`⚠️ Warning: Gagal membaca .gitignore di ${cwd}`);
    }
  }

  // Get all files, avoiding hidden directories automatically by fast-glob options if possible,
  // but we already ignore them with the ig instance anyway.
  // Using fast-glob to scan everything (with dot=true so we can catch .env, .gitignore, etc.)
  // and then filtering through our ignore rules.
  // Note: we can pass basic ignore patterns to fast-glob directly to drastically improve performance.
  const basicGlobsIgnores = [
    "**/node_modules/**",
    "**/.git/**"
  ];

  const files = await fg(["**/*"], {
    cwd,
    dot: true,
    onlyFiles: true,
    ignore: basicGlobsIgnores
  });

  const relevantFiles: ScannedFile[] = [];

  for (const file of files) {
    if (!ig.ignores(file)) {
      relevantFiles.push({
        path: file,
        extension: path.extname(file),
      });
    }
  }

  return relevantFiles;
}
