import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { codebaseFiles, codebases, projects } from "@/lib/db/schema";
import { validateBearerToken } from "@/lib/api-auth";
import { eq, and, or, ilike } from "drizzle-orm";

export async function GET(
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

    const query = req.nextUrl.searchParams.get("query");
    if (!query) {
      return NextResponse.json({ error: "Query parameter 'query' is required" }, { status: 400 });
    }

    // 2. Verifikasi kepemilikan codebase
    const codebase = await db.query.codebases.findFirst({
      where: eq(codebases.id, codebaseId),
    });

    if (!codebase) {
      return NextResponse.json({ error: "Codebase not found" }, { status: 404 });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, codebase.projectId), eq(projects.ownerId, userId)),
    });

    if (!project) {
      return NextResponse.json(
        { error: "Unauthorized to access this codebase" },
        { status: 403 }
      );
    }

    // 3. Cari file yang summary atau path-nya cocok dengan query (ILIKE)
    // Batasi top 5 file
    const searchPattern = `%${query}%`;
    const relevantFiles = await db.query.codebaseFiles.findMany({
      where: and(
        eq(codebaseFiles.codebaseId, codebaseId),
        or(
          ilike(codebaseFiles.summary, searchPattern),
          ilike(codebaseFiles.filePath, searchPattern)
        )
      ),
      limit: 5,
    });

    // Format response agar tidak mengembalikan info yang tidak perlu
    const formattedFiles = relevantFiles.map((file) => ({
      filePath: file.filePath,
      summary: file.summary,
      language: file.language,
      // Kembalikan snippet jika ada
      codeSnippet: file.codeSnippet,
    }));

    return NextResponse.json({
      query,
      results: formattedFiles,
    });
  } catch (error: any) {
    console.error("GET /api/codebases/[codebaseId]/context Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to retrieve context" },
      { status: 500 }
    );
  }
}
