import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { codebases, codebaseFiles, projects } from "@/lib/db/schema";
import { validateBearerToken } from "@/lib/api-auth";
import { eq, and } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ codebaseId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { codebaseId } = resolvedParams;

    // 1. Validasi token dari header
    const userId = await validateBearerToken(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body (isi dari .project-planner/index.json)
    const body = await req.json();
    const { files, framework, syncMode } = body;

    if (!Array.isArray(files)) {
      return NextResponse.json(
        { error: "Invalid payload: files must be an array" },
        { status: 400 }
      );
    }

    // 3. Verifikasi kepemilikan codebase
    // Ambil codebase dan project-nya untuk memastikan user memiliki akses
    const codebase = await db.query.codebases.findFirst({
      where: eq(codebases.id, codebaseId),
    });

    if (!codebase) {
      return NextResponse.json({ error: "Codebase not found" }, { status: 404 });
    }

    // Pastikan user adalah pemilik project
    // Di schema, codebases belong to projects, but we need to query project owner manually
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, codebase.projectId), eq(projects.ownerId, userId)),
    });

    if (!project) {
      return NextResponse.json(
        { error: "Unauthorized to access this codebase" },
        { status: 403 }
      );
    }

    // 4. Update codebase metadata
    await db
      .update(codebases)
      .set({
        framework: framework || codebase.framework,
        syncMode: syncMode || codebase.syncMode,
        lastSyncedAt: new Date(),
      })
      .where(eq(codebases.id, codebaseId));

    // 5. Replace codebase_files
    // Mulai transaksi untuk menghapus file lama dan memasukkan file baru
    await db.transaction(async (tx) => {
      // Hapus file lama untuk codebase ini
      await tx.delete(codebaseFiles).where(eq(codebaseFiles.codebaseId, codebaseId));

      // Jika tidak ada file yang dikirim, kita selesai
      if (files.length === 0) return;

      // Batasi insert per batch untuk mencegah query terlalu besar (misal max 500 baris per insert)
      const batchSize = 500;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize).map((f: any) => ({
          codebaseId,
          filePath: f.filePath,
          summary: f.summary || null,
          codeSnippet: f.codeSnippet || null,
          language: f.extension || null,
        }));
        await tx.insert(codebaseFiles).values(batch);
      }
    });

    return NextResponse.json({
      message: "Sync successful",
      syncedFilesCount: files.length,
    });
  } catch (error: any) {
    console.error("POST /api/codebases/[codebaseId]/sync Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync codebase" },
      { status: 500 }
    );
  }
}
